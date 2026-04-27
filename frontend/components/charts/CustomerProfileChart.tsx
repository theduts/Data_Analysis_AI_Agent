import React, { useMemo, useState } from 'react';

// ─── Domain types ────────────────────────────────────────────────────────────

interface CustomerProfile {
    clusterAtual: string;
    classeCompra: string;
    genero: string;
    faixaEtaria: string;
    ticketMedio: string;
    totalClientes: number;
    pctCompraram: number;
    pa: number;
}

interface Props {
    data: any;
}

// ─── Constants & Helpers ─────────────────────────────────────────────────────

const GENDER_LABEL: Record<string, string> = {
    MASCULINO: 'Masculino',
    FEMININO: 'Feminino',
    'NAO INFORMADO': 'Não Informado',
};

const CLUSTER_LABEL: Record<string, string> = {
    PREMIUM: 'Premium',
    'ALTO POTENCIAL': 'Alto Potencial',
    'MEDIO POTENCIAL': 'Médio Potencial',
    'BAIXO POTENCIAL': 'Baixo Potencial',
    INATIVO: 'Inativo',
    NOVO: 'Novo',
    OCASIONAL: 'Ocasional',
    'OCASIONAL RISCO': 'Ocasional Risco',
    HABITUAL: 'Habitual',
};

function resolveGenderLabel(raw: string): string {
    return GENDER_LABEL[raw?.toUpperCase()] ?? raw ?? 'N/A';
}

function resolveClusterLabel(raw: string): string {
    return CLUSTER_LABEL[raw?.toUpperCase()] ?? raw ?? 'N/A';
}

function formatCurrency(val: string | number | null | undefined): string {
    if (val === null || val === undefined || val === '') return 'N/A';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return val.toString();
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(num);
}

function formatNumber(val: number | null | undefined): string {
    if (val === null || val === undefined) return '0';
    return new Intl.NumberFormat('pt-BR').format(val);
}

// ─── Attribute row definition ─────────────────────────────────────────────────

interface AttrDef {
    icon: string;
    label: string;
    colorClass: string;
    getValue: (p: CustomerProfile) => string;
}

const ATTRIBUTE_ROWS: AttrDef[] = [
    {
        icon: '⚧',
        label: 'Gênero',
        colorClass: 'bg-blue-500/20 text-blue-400',
        getValue: (p) => resolveGenderLabel(p.genero),
    },
    {
        icon: '💳',
        label: 'Classe de Compra',
        colorClass: 'bg-emerald-500/20 text-emerald-400',
        getValue: (p) => p.classeCompra,
    },
    {
        icon: '🎂',
        label: 'Faixa Etária',
        colorClass: 'bg-violet-500/20 text-violet-400',
        getValue: (p) => p.faixaEtaria,
    },
    {
        icon: '💰',
        label: 'Ticket Médio',
        colorClass: 'bg-amber-500/20 text-amber-400',
        getValue: (p) => formatCurrency(p.ticketMedio),
    },
    {
        icon: '📦',
        label: 'PA (produtos/atend.)',
        colorClass: 'bg-orange-500/20 text-orange-400',
        getValue: (p) => p.pa.toString(),
    },
];

// ─── Main component ──────────────────────────────────────────────────────────

const CustomerProfileChart: React.FC<Props> = ({ data }) => {
    const [activeTab, setActiveTab] = useState<'target' | 'nao-target'>('target');

    const profiles = useMemo<CustomerProfile[]>(() => {
        const rawArray = data?.datasets?.[0]?.data;
        if (!Array.isArray(rawArray) || rawArray.length === 0) return [];

        return rawArray.map(raw => ({
            clusterAtual: raw.cluster_atual,
            classeCompra: raw.poder_de_compra_cliente,
            genero: raw.genero_cliente,
            faixaEtaria: raw.faixa_etaria,
            ticketMedio: raw.ticket_medio,
            totalClientes: raw.total_clientes,
            pctCompraram: raw.pct_compraram || 0,
            pa: raw.peca_por_atendimento || 0,
        }));
    }, [data]);

    const getProfile = (clusterName: string): CustomerProfile | null =>
        profiles.find(p => p.clusterAtual.toUpperCase() === clusterName.toUpperCase()) || null;

    const targetClusters = ['Premium', 'Alto Potencial', 'Médio Potencial'];
    const naoTargetClusters = ['Habitual', 'Ocasional', 'Ocasional Risco'];
    const displayedClusters = activeTab === 'target' ? targetClusters : naoTargetClusters;

    if (profiles.length === 0) {
        return (
            <div className="w-full flex items-center justify-center py-12 border rounded-xl bg-card">
                <p className="text-muted-foreground text-sm">Sem dados de perfil.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-5 w-full">

            {/* ── Tab toggle ─────────────────────────────────────────────── */}
            <div className="flex p-1 bg-muted/30 rounded-lg w-fit border border-border/50">
                {(['target', 'nao-target'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-6 py-1.5 text-[13px] font-semibold rounded-md transition-all ${activeTab === tab
                            ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
                            }`}
                    >
                        {tab === 'target' ? 'Target' : 'Oportunidade'}
                    </button>
                ))}
            </div>

            {/* ── Aligned 3-column grid ───────────────────────────────────
                Every row corresponds to:
                  row 1  — cluster badge + name
                  row 2  — stats pill (base total + % compraram)
                  row 3+ — attribute rows (Gênero, Classe …)
                All cells share the same implicit row height via
                'grid-rows-[auto_auto_auto_auto_auto_auto_auto]' so
                content aligns perfectly across all 3 columns.
            ──────────────────────────────────────────────────────────── */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gridTemplateRows: 'auto auto' + ' auto'.repeat(ATTRIBUTE_ROWS.length),
                    columnGap: '0',
                }}
            >
                {displayedClusters.map((clusterName, colIdx) => {
                    const profile = getProfile(clusterName);
                    const label = resolveClusterLabel(clusterName);
                    const isLast = colIdx === displayedClusters.length - 1;

                    /* Number of explicit rows: header + stats + attributes */
                    const totalRows = 2 + ATTRIBUTE_ROWS.length;

                    return (
                        <div
                            key={clusterName}
                            className={`flex flex-col ${!isLast ? 'border-r border-white/[0.07]' : ''}`}
                        >
                            {/* ── Row 1: Cluster header ── */}
                            <div className={`px-4 pt-1 pb-3 flex items-center gap-2.5`}>
                                <span className={`text-[15px] font-extrabold tracking-tight text-slate-100 uppercase`}>
                                    {label}
                                </span>
                            </div>

                            {/* ── Row 2: Stats pill ── */}
                            <div className="px-4 pb-4">
                                {profile ? (
                                    <div className="flex flex-col gap-1.5 bg-muted/30 rounded-lg p-2.5 border border-white/[0.06]">
                                        <div className="flex items-center justify-between text-[11px] leading-none">
                                            <span className="text-slate-400 font-medium">👥 Base Total</span>
                                            <span className="text-slate-100 font-bold tabular-nums">
                                                {formatNumber(profile.totalClientes)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-[11px] leading-none">
                                            <span className="text-slate-400 font-medium">🛍️ % Compraram</span>
                                            <span className="text-slate-100 font-bold tabular-nums">
                                                {profile.pctCompraram}%
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-lg p-2.5 border border-white/[0.06] bg-muted/10">
                                        <p className="text-[11px] text-slate-500 italic">Sem dados</p>
                                    </div>
                                )}
                            </div>

                            {/* ── Divider before attributes ── */}
                            <div className="mx-4 mb-3 border-t border-white/[0.05]" />

                            {/* ── Rows 3+: Attribute rows ── */}
                            {ATTRIBUTE_ROWS.map((attr) => (
                                <div
                                    key={attr.label}
                                    className="px-4 py-2.5 flex items-center gap-3"
                                >
                                    <span
                                        className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-[13px] ${attr.colorClass}`}
                                    >
                                        {attr.icon}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-0.5 leading-none">
                                            {attr.label}
                                        </p>
                                        <p className="text-[13px] font-bold text-slate-50 leading-tight truncate">
                                            {profile ? attr.getValue(profile) : '—'}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default CustomerProfileChart;
