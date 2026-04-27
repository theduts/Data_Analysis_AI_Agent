import React, { useMemo, useState, useEffect } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { BarChart2, MapPin, Store, ShoppingCart, Loader2, X, Search } from 'lucide-react';
import { reportService, BranchMetricItem } from '../../services/reportService';

// Remote URL to avoid requiring local file downloads
const geoUrl =
    'https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson';

// Mapping from full state name → UF sigla (fallback for GeoJSON without 'sigla' property)
const STATE_NAME_TO_UF: Readonly<Record<string, string>> = {
    Acre: 'AC', Alagoas: 'AL', 'Amapá': 'AP', Amazonas: 'AM', Bahia: 'BA',
    'Ceará': 'CE', 'Distrito Federal': 'DF', 'Espírito Santo': 'ES',
    'Goiás': 'GO', 'Maranhão': 'MA', 'Mato Grosso': 'MT',
    'Mato Grosso do Sul': 'MS', 'Minas Gerais': 'MG', 'Pará': 'PA',
    'Paraíba': 'PB', 'Paraná': 'PR', Pernambuco: 'PE', 'Piauí': 'PI',
    'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN',
    'Rio Grande do Sul': 'RS', 'Rondônia': 'RO', Roraima: 'RR',
    'Santa Catarina': 'SC', 'São Paulo': 'SP', Sergipe: 'SE',
    Tocantins: 'TO',
} as const;

// ─── Domain types ──────────────────────────────────────────────────────────────

type Channel = 'loja_fisica' | 'ecomm';
type ViewMode = 'geral' | 'target';

interface EstadoRow {
    estado?: string;
    estado_cliente?: string;
    total_clientes: number;
    percentual: number;
    nome_filial?: string; // loja_fisica target only
}

interface RegiaoRow {
    regiao: string;
    total_clientes: number;
    percentual: number;
}

interface ChannelData {
    by_estado: EstadoRow[];
    by_regiao: RegiaoRow[];
    by_target_estado: EstadoRow[];
    by_target_regiao: RegiaoRow[];
}

interface HeatmapPayload {
    loja_fisica?: ChannelData;
    ecomm?: ChannelData;
}

interface Props {
    data: any;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Resolves the UF code from a GeoJSON feature, trying several property paths. */
const resolveUF = (geo: any): string => {
    const sigla = geo.properties?.sigla;
    if (sigla) return String(sigla).toUpperCase().trim();
    const name: string = geo.properties?.name ?? '';
    return (STATE_NAME_TO_UF[name] ?? geo.id ?? name).toUpperCase().trim();
};

/** Aggregates estado rows by UF into a lookup map `UF → total_clientes`. */
const buildValueMap = (rows: EstadoRow[]): Record<string, number> =>
    rows.reduce<Record<string, number>>((acc, row) => {
        const uf = String(row.estado ?? row.estado_cliente ?? '').toUpperCase().trim();
        if (uf && uf !== 'NÃO INFORMADO') {
            acc[uf] = (acc[uf] ?? 0) + row.total_clientes;
        }
        return acc;
    }, {});

/** Maps a 0-1 intensity ratio to a HSL colour (green → red). */
const intensityToColor = (ratio: number): { fill: string; hover: string } => {
    const hue = Math.round((1 - ratio) * 120);
    return { fill: `hsl(${hue}, 85%, 45%)`, hover: `hsl(${hue}, 90%, 35%)` };
};

// ─── Component ─────────────────────────────────────────────────────────────────

const CustomerHeatmap: React.FC<Props> = ({ data }) => {
    // Parse the dual-channel payload from ChartData.datasets[0].data[0]
    const payload = useMemo<HeatmapPayload>(() => {
        const raw = data?.datasets?.[0]?.data?.[0];
        if (!raw) return {};

        // Backward compatibility: If it's an old cache format without 'loja_fisica'/'ecomm'
        if (typeof raw === 'object' && !Array.isArray(raw) && !raw.loja_fisica && !raw.ecomm && raw.by_estado) {
            // Treat the old flat format as loja_fisica so it renders something
            return {
                loja_fisica: {
                    by_estado: raw.by_estado || [],
                    by_regiao: raw.by_regiao || [],
                    by_target_estado: raw.by_estado_target || [], // Note: old format used by_estado_target
                    by_target_regiao: raw.by_regiao_target || [], // Note: old format used by_regiao_target
                }
            };
        }

        if (typeof raw === 'object' && !Array.isArray(raw)) {
            return raw as HeatmapPayload;
        }
        return {};
    }, [data]);

    // DEBUG — remove after fixing
    React.useEffect(() => {

    }, [data, payload]);

    const [channel, setChannel] = useState<Channel>('loja_fisica');
    const [viewMode, setViewMode] = useState<ViewMode>('geral');
    const [tooltip, setTooltip] = useState<{
        name: string;
        value: number;
        x: number;
        y: number;
    } | null>(null);

    const [selectedUF, setSelectedUF] = useState<string | null>(null);
    const [branchesLoading, setBranchesLoading] = useState<boolean>(false);
    const [branchesData, setBranchesData] = useState<BranchMetricItem[]>([]);
    const [branchPage, setBranchPage] = useState<number>(0);
    const [branchSearch, setBranchSearch] = useState<string>('');
    const BRANCHES_PER_PAGE = 7;

    useEffect(() => {
        if (!selectedUF || channel !== 'loja_fisica') {
            setBranchesData([]);
            setBranchesLoading(false);
            return;
        }

        // Set loading immediately (synchronously), before the async fetch
        setBranchesLoading(true);
        setBranchesData([]);

        const abortController = new AbortController();

        const fetchBranches = async () => {
            try {
                const response = await reportService.getStateBranches(
                    selectedUF, 
                    channel, 
                    viewMode === 'target'
                );
                if (!abortController.signal.aborted) {
                    setBranchesData(response.branches || []);
                    setBranchPage(0);
                    setBranchSearch(''); // clear search on new state
                }
            } catch (error) {
                if (!abortController.signal.aborted) {
                    console.error("Failed to load branches", error);
                    setBranchesData([]);
                }
            } finally {
                if (!abortController.signal.aborted) {
                    setBranchesLoading(false);
                }
            }
        };

        fetchBranches();

        return () => {
            abortController.abort();
        };
    }, [selectedUF, channel, viewMode]);

    // Resolve the active channel data set
    const channelData = useMemo<ChannelData>(() => {
        const empty: ChannelData = {
            by_estado: [],
            by_regiao: [],
            by_target_estado: [],
            by_target_regiao: [],
        };
        return payload[channel] ?? empty;
    }, [payload, channel]);

    // Build estado value map depending on viewMode
    const valueMap = useMemo<Record<string, number>>(() => {
        const rows =
            viewMode === 'target' ? channelData.by_target_estado : channelData.by_estado;
        return buildValueMap(rows);
    }, [channelData, viewMode]);

    const maxValue = useMemo<number>(() => {
        const vals = Object.values(valueMap);
        return vals.length > 0 ? Math.max(...vals) : 1;
    }, [valueMap]);

    // Region rows for sidebar
    const regiaoRows = useMemo<RegiaoRow[]>(() => {
        return viewMode === 'target'
            ? channelData.by_target_regiao
            : channelData.by_regiao;
    }, [channelData, viewMode]);

    const channelConfig: Record<Channel, { label: string; icon: React.ReactNode }> = {
        loja_fisica: { label: 'Loja Física', icon: <Store className="w-3.5 h-3.5" /> },
        ecomm: { label: 'Ecomm', icon: <ShoppingCart className="w-3.5 h-3.5" /> },
    };

    return (
        <div className="flex flex-col h-full gap-4">
            {/* ── Top controls ───────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Channel toggle */}
                <div className="flex bg-muted rounded-md p-1 gap-0.5">
                    {(['loja_fisica', 'ecomm'] as Channel[]).map((ch) => (
                        <button
                            key={ch}
                            id={`heatmap-channel-${ch}`}
                            onClick={() => setChannel(ch)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-sm font-medium transition-colors ${
                                channel === ch
                                    ? 'bg-background shadow-sm text-foreground'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {channelConfig[ch].icon}
                            {channelConfig[ch].label}
                        </button>
                    ))}
                </div>

                {/* View mode toggle */}
                <div className="flex bg-muted rounded-md p-1 gap-0.5">
                    {(['geral', 'target'] as ViewMode[]).map((mode) => (
                        <button
                            key={mode}
                            id={`heatmap-view-${mode}`}
                            onClick={() => setViewMode(mode)}
                            className={`px-3 py-1.5 text-xs rounded-sm font-medium transition-colors ${
                                viewMode === mode
                                    ? 'bg-background shadow-sm text-foreground'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {mode === 'geral' ? 'Total Geral' : 'Apenas Target'}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Main content ───────────────────────────────────────────────── */}
            <div className="flex flex-col md:flex-row flex-1 gap-6 min-h-0">
                {/* Map section */}
                <div className="flex-1 flex flex-col items-center min-h-0">
                    <h4 className="w-full text-sm font-medium text-muted-foreground flex items-center gap-2 mb-3">
                        <MapPin className="w-4 h-4" />
                        Distribuição Geográfica —{' '}
                        <span className="font-semibold text-foreground">
                            {channelConfig[channel].label}
                        </span>
                    </h4>

                    <div className="w-full relative min-h-[250px] flex items-center justify-center bg-muted/20 rounded-xl p-4">
                        <ComposableMap
                            projection="geoMercator"
                            projectionConfig={{ scale: 650, center: [-54, -15] }}
                            style={{ width: '100%', height: '100%' }}
                        >
                            <Geographies geography={geoUrl}>
                                {({ geographies }) =>
                                    geographies.map((geo) => {
                                        const stateId = resolveUF(geo);
                                        const val = valueMap[stateId] ?? 0;
                                        const stateName: string =
                                            geo.properties?.name ?? stateId;

                                        const { fill: fillStyle, hover: hoverFill } =
                                            val > 0
                                                ? intensityToColor(
                                                      Math.pow(val / (maxValue || 1), 0.5)
                                                  )
                                                : { fill: '#F3F4F6', hover: '#E5E7EB' };

                                        return (
                                            <Geography
                                                key={geo.rsmKey}
                                                geography={geo}
                                                fill={fillStyle}
                                                stroke="#D1D5DB"
                                                strokeWidth={0.5}
                                                onMouseEnter={(e: React.MouseEvent) =>
                                                    setTooltip({
                                                        name: stateName,
                                                        value: val,
                                                        x: e.clientX,
                                                        y: e.clientY,
                                                    })
                                                }
                                                onMouseMove={(e: React.MouseEvent) =>
                                                    setTooltip((prev) =>
                                                        prev
                                                            ? {
                                                                  ...prev,
                                                                  x: e.clientX,
                                                                  y: e.clientY,
                                                              }
                                                            : null
                                                    )
                                                }
                                                onMouseLeave={() => setTooltip(null)}
                                                onClick={() => {
                                                    if (channel === 'loja_fisica') setSelectedUF(stateId);
                                                }}
                                                style={{
                                                    default: {
                                                        outline: 'none',
                                                        transition: 'all 250ms',
                                                        cursor: channel === 'loja_fisica' ? 'pointer' : 'default'
                                                    },
                                                    hover: { 
                                                        fill: hoverFill, 
                                                        outline: 'none',
                                                        cursor: channel === 'loja_fisica' ? 'pointer' : 'default'
                                                    },
                                                    pressed: { outline: 'none' },
                                                }}
                                            />
                                        );
                                    })
                                }
                            </Geographies>
                        </ComposableMap>

                        {/* Colour legend */}
                        <div className="absolute bottom-4 right-4 flex flex-col items-center bg-background/90 backdrop-blur-sm p-2 rounded-lg shadow-sm border border-border text-xs pointer-events-none">
                            <span className="text-muted-foreground mb-1.5 font-medium text-[10px] uppercase tracking-wider">
                                Volume de Clientes
                            </span>
                            <div className="flex items-center gap-2">
                                <span className="text-muted-foreground text-[10px] font-medium">
                                    Menor
                                </span>
                                <div
                                    className="w-24 h-2 rounded-full"
                                    style={{
                                        background:
                                            'linear-gradient(to right, hsl(120, 85%, 45%), hsl(60, 85%, 45%), hsl(0, 85%, 45%))',
                                    }}
                                />
                                <span className="text-muted-foreground text-[10px] font-medium">
                                    Maior
                                </span>
                            </div>
                        </div>

                        {/* Tooltip */}
                        {tooltip && (
                            <div
                                className="fixed z-50 pointer-events-none bg-popover border border-border rounded-md shadow-md px-3 py-1.5 animate-in fade-in zoom-in-95 duration-200"
                                style={{
                                    left: `${tooltip.x}px`,
                                    top: `${tooltip.y - 12}px`,
                                    transform: 'translate(-50%, -100%)',
                                }}
                            >
                                <div className="flex flex-col gap-0.5 text-center">
                                    <span className="font-semibold text-foreground text-sm">
                                        {tooltip.name}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {tooltip.value.toLocaleString('pt-BR')} clientes
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Dynamic sidebar: Region or State Branches */}
                <div className="w-full md:w-1/3 flex flex-col border-l border-border pl-6">
                    {selectedUF && channel === 'loja_fisica' ? (
                        <>
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-primary" />
                                    Filiais — {selectedUF}
                                </h4>
                                <button 
                                    onClick={() => setSelectedUF(null)}
                                    className="p-1 hover:bg-muted rounded-md transition-colors"
                                    title="Voltar para visão por região"
                                >
                                    <X className="w-4 h-4 text-muted-foreground" />
                                </button>
                            </div>
                            
                            {branchesLoading ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
                                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                                    <span className="text-xs">Carregando filiais...</span>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
                                    {/* Search input */}
                                    <div className="relative mb-3">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                                        <input
                                            type="text"
                                            value={branchSearch}
                                            onChange={e => { setBranchSearch(e.target.value); setBranchPage(0); }}
                                            placeholder="Buscar filial..."
                                            className="w-full text-xs pl-7 pr-3 py-1.5 rounded-md bg-muted border border-border placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                                        />
                                        {branchSearch && (
                                            <button
                                                onClick={() => { setBranchSearch(''); setBranchPage(0); }}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>

                                    {/* Filtered + paginated list */}
                                    {(() => {
                                        const filtered = branchesData.filter(b =>
                                            b.filial.toLowerCase().includes(branchSearch.toLowerCase())
                                        );
                                        const totalPages = Math.ceil(filtered.length / BRANCHES_PER_PAGE);
                                        const paginated = filtered.slice(
                                            branchPage * BRANCHES_PER_PAGE,
                                            (branchPage + 1) * BRANCHES_PER_PAGE
                                        );
                                        if (filtered.length === 0) return (
                                            <p className="text-xs text-muted-foreground italic mt-4 text-center">
                                                {branchSearch ? 'Nenhuma filial encontrada para essa busca.' : 'Nenhuma filial encontrada para este estado.'}
                                            </p>
                                        );
                                        return (
                                            <>
                                                <div className="flex flex-col gap-3 flex-1">
                                                    {paginated.map((branch, idx) => {
                                                        const basis = Math.min(100, Number(branch.percentual ?? 0));
                                                        return (
                                                            <div key={idx} className="flex flex-col gap-1">
                                                                <div className="flex justify-between text-sm">
                                                                    <span className="font-medium text-foreground text-xs truncate mr-2" title={branch.filial}>
                                                                        {branch.filial}
                                                                    </span>
                                                                    <span className="font-semibold text-xs whitespace-nowrap">
                                                                        {branch.percentual}%
                                                                    </span>
                                                                </div>
                                                                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                                                    <div
                                                                        className="h-full bg-primary transition-all duration-500"
                                                                        style={{ width: `${basis}%` }}
                                                                    />
                                                                </div>
                                                                <span className="text-[10px] text-muted-foreground">
                                                                    {branch.total_clientes.toLocaleString('pt-BR')} clientes
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {/* Pagination controls */}
                                                {totalPages > 1 && (
                                                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                                                        <button
                                                            onClick={() => setBranchPage(p => Math.max(0, p - 1))}
                                                            disabled={branchPage === 0}
                                                            className="px-2 py-1 text-xs rounded-md bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                        >
                                                            ← Ant.
                                                        </button>
                                                        <span className="text-[10px] text-muted-foreground">
                                                            {branchPage + 1} / {totalPages}
                                                        </span>
                                                        <button
                                                            onClick={() => setBranchPage(p => Math.min(totalPages - 1, p + 1))}
                                                            disabled={branchPage >= totalPages - 1}
                                                            className="px-2 py-1 text-xs rounded-md bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                        >
                                                            Próx. →
                                                        </button>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <h4 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
                                <BarChart2 className="w-4 h-4" />
                                Por Região
                            </h4>
                            <div className="flex-1 flex flex-col gap-3 pr-2 overflow-y-auto">
                                {regiaoRows.slice(0, 8).map((item, idx) => {
                                    const barBasis = Math.min(100, Number(item.percentual ?? 0));
                                    return (
                                        <div key={idx} className="flex flex-col gap-1">
                                            <div className="flex justify-between text-sm">
                                                <span className="font-medium text-foreground">
                                                    {item.regiao}
                                                </span>
                                                <span className="font-semibold">
                                                    {item.percentual}%
                                                </span>
                                            </div>
                                            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-primary transition-all duration-500"
                                                    style={{ width: `${barBasis}%` }}
                                                />
                                            </div>
                                            <span className="text-xs text-muted-foreground">
                                                {item.total_clientes.toLocaleString('pt-BR')}{' '}
                                                clientes
                                            </span>
                                        </div>
                                    );
                                })}
                                {regiaoRows.length === 0 && (
                                    <p className="text-xs text-muted-foreground italic">
                                        Sem dados de região disponíveis.
                                    </p>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CustomerHeatmap;
