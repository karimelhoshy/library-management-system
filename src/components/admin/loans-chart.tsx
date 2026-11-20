"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { date: string; loans: number; returns: number };

const dayLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const label = (iso: string) => dayLabel.format(new Date(`${iso}T00:00:00Z`));

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm shadow-[0_4px_16px_rgba(28,25,23,0.08)]">
      <p className="font-semibold text-foreground">{label(point.date)}</p>
      <p className="text-ink-2">
        {point.loans} {point.loans === 1 ? "loan" : "loans"} · {point.returns} returned
      </p>
    </div>
  );
}

/** Loans started per day. One series, so no legend: the card title names it. */
export function LoansChart({ data }: { data: Point[] }) {
  const total = data.reduce((sum, d) => sum + d.loans, 0);
  return (
    <figure>
      <div className="h-[220px] w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -24 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
            <XAxis
              dataKey="date"
              tickFormatter={label}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tick={{ fill: "var(--ink-3)", fontSize: 12 }}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--ink-3)", fontSize: 12 }}
              width={48}
            />
            <Tooltip cursor={{ fill: "var(--accent)" }} content={<ChartTooltip />} />
            <Bar dataKey="loans" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        {total} loans over the last {data.length} days.
      </figcaption>
      <table className="sr-only">
        <caption>Loans per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Loans</th>
            <th scope="col">Returns</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <th scope="row">{label(d.date)}</th>
              <td>{d.loans}</td>
              <td>{d.returns}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
