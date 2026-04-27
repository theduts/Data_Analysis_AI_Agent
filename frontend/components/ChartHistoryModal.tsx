import React from 'react';
import { HistoricChart } from '../types';
import ChartRenderer from './ChartRenderer';
import ExportButtons from './ExportButtons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';

interface ChartHistoryModalProps {
  charts: HistoricChart[];
  onClose: () => void;
  onGoToConversation: (conversationId: string) => void;
}

const ChartHistoryModal: React.FC<ChartHistoryModalProps> = ({ charts, onClose, onGoToConversation }) => {
  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>Gráficos</DialogTitle>
          <DialogDescription>Ver e exportar todos os gráficos gerados</DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 pb-6">
          {charts.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              <p>Nenhum gráfico foi gerado ainda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4">
              {charts.map(({ chartData, conversationId, messageId }) => (
                <Card key={messageId}>
                  <CardContent className="p-4">
                    <ChartRenderer chartData={chartData} />
                    <div className="mt-4 flex items-center justify-between">
                      <ExportButtons chartData={chartData} />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onGoToConversation(conversationId)}
                      >
                        Ir para a Conversa
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default ChartHistoryModal;
