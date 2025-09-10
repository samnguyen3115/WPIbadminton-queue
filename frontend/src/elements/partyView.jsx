import React, { useMemo } from "react";
import { useQueueStore } from "../store/useQueueStore";

export default function PartyTable() {
    const { courtAssignments, playersByIndex } = useQueueStore();

    const rows = useMemo(() => {
        const out = [];
        Object.entries(courtAssignments).forEach(([court, idxs]) => {
            (idxs || []).forEach((i) => {
                const p = playersByIndex(i);
                if (p) out.push({ ...p, court });
            });
        });
        return out;
    }, [courtAssignments, playersByIndex]);

    return (
        <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
                <thead className="bg-gray-50">
                <tr>
                    <th className="px-3 py-2 text-left w-16">#</th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Level</th>
                    <th className="px-3 py-2 text-left">Court</th>
                </tr>
                </thead>
                <tbody>
                {rows.length === 0 ? (
                    <tr><td className="px-3 py-3 text-gray-500" colSpan={4}>No one is on a court</td></tr>
                ) : rows.map((r, i) => (
                    <tr key={`${r.name}-${r.court}`} className="odd:bg-white even:bg-gray-50">
                        <td className="px-3 py-2">{i + 1}</td>
                        <td className="px-3 py-2">{r.name}</td>
                        <td className="px-3 py-2 capitalize">{r.qualification}</td>
                        <td className="px-3 py-2">{r.court}</td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}
