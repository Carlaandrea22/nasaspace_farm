"use client";

import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BalanceRow } from "../../domain/water-balance/model";

export default function BalanceChart({ data, turnDate }: { data: BalanceRow[]; turnDate: string }) {
  return (
    <div className="h-60 min-w-0" aria-label="Gráfico del agua almacenada y el umbral de estrés">
      <ResponsiveContainer width="100%" height="100%" minWidth={1}>
        <LineChart data={data} margin={{ top: 12, right: 12, bottom: 6, left: 0 }}>
          <XAxis dataKey="date" tickFormatter={(date: string) => date.slice(5).split("-").reverse().join("/")} minTickGap={24} />
          <YAxis width={37} unit=" mm" />
          <Tooltip />
          <ReferenceLine x={turnDate} stroke="#48594c" strokeDasharray="3 4" />
          <Line dataKey="storageMm" name="Agua en raíces" stroke="#304d37" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="thresholdMm" name="Umbral" stroke="#975730" strokeDasharray="6 4" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
