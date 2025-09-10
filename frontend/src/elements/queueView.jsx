import React from "react";
import { useQueueStore } from "../store/useQueueStore";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";

function QueueTable({ title, rows }) {
    return (
        <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
                <thead className="bg-gray-50">
                <tr>
                    <th className="px-3 py-2 text-left w-16">#</th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Level</th>
                </tr>
                </thead>
                <tbody>
                {rows.length === 0 ? (
                    <tr><td className="px-3 py-3 text-gray-500" colSpan={3}>No players</td></tr>
                ) : rows.map((p, i) => (
                    <tr key={p.id ?? p.name} className="odd:bg-white even:bg-gray-50">
                        <td className="px-3 py-2 font-semibold">{i + 1}</td>
                        <td className="px-3 py-2">{p.name}</td>
                        <td className="px-3 py-2 capitalize">{p.qualification}</td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}

export default function QueueCarousel() {
    const { advancedQueuePlayers, intermediateQueuePlayers } = useQueueStore();

    return (
        <div className="relative">
            <Carousel className="w-full">
                <CarouselContent>
                    <CarouselItem className="p-2">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold">Advanced</h3>
                        </div>
                        <QueueTable title="Advanced" rows={advancedQueuePlayers} />
                    </CarouselItem>

                    <CarouselItem className="p-2">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold">Intermediate</h3>
                        </div>
                        <QueueTable title="Intermediate" rows={intermediateQueuePlayers} />
                    </CarouselItem>
                </CarouselContent>
                <CarouselPrevious />
                <CarouselNext />
            </Carousel>
        </div>
    );
}
