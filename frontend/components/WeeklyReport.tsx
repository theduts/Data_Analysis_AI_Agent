import React from 'react';

const RecorteSemana: React.FC = () => {
    return (
        <div className="flex flex-col space-y-4">
            <h2 className="text-xl font-semibold mb-2 text-foreground">Recorte da Semana</h2>
            <p className="text-sm text-muted-foreground">
                Resumo semanal de métricas, novidades, ou destaques importantes configurados pelo administrador.
            </p>
            {/* Future content goes here */}
        </div>
    );
};

export default RecorteSemana;
