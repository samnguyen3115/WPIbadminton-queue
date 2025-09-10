import React from "react";
import { useQueueStore } from "../store/useQueueStore";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel.jsx";

function CourtCard({ courtName }) {
    const { courtTypes, playersOnCourt, changeCourtType, rotateCourtPlayers } = useQueueStore();
    const type = courtTypes[courtName] ?? "intermediate";
    const players = playersOnCourt(courtName);

    return (
        <div className={`rounded-xl border shadow p-3 ${courtName.startsWith("G") ? "border-green-500" : "border-amber-500"}`}>
            <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">
                    <span className="mr-2">{courtName}</span>
                    {courtName.startsWith("G") && (
                        <button
                            className="text-xs px-2 py-1 rounded bg-green-600 text-white"
                            onClick={() => rotateCourtPlayers(courtName)}
                            title="Finish game - rotate players"
                        >
                            Rotate
                        </button>
                    )}
                </div>

                <select
                    className="border rounded px-2 py-1 text-sm"
                    value={type}
                    onChange={(e) => changeCourtType(courtName, e.target.value)}
                    disabled={courtName.startsWith("W")} // inherits from paired G court
                    title={courtName.startsWith("W") ? "Inherited from paired G court" : ""}
                >
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                    <option value="training">Training</option>
                </select>
            </div>

            <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                    <tr>
                        <th className="px-3 py-2 text-left w-16">#</th>
                        <th className="px-3 py-2 text-left">Player</th>
                        <th className="px-3 py-2 text-left">Level</th>
                    </tr>
                    </thead>
                    <tbody>
                    {(players ?? []).length === 0 ? (
                        <tr><td colSpan={3} className="px-3 py-3 text-gray-500">Empty</td></tr>
                    ) : players.map((p, i) => (
                        <tr key={p.id ?? p.name} className="odd:bg-white even:bg-gray-50">
                            <td className="px-3 py-2">{i + 1}</td>
                            <td className="px-3 py-2">{p.name}</td>
                            <td className="px-3 py-2 capitalize">{p.qualification}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function CourtPair({ g, w }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <CourtCard courtName={g} />
            <CourtCard courtName={w} />
        </div>
    );
}

export default function CourtCarousel() {
    return (
        <div className="relative">
            <Carousel className="w-full">
                <CarouselContent>
                    <CarouselItem className="p-2"><CourtPair g="G1" w="W1" /></CarouselItem>
                    <CarouselItem className="p-2"><CourtPair g="G2" w="W2" /></CarouselItem>
                    <CarouselItem className="p-2"><CourtPair g="G3" w="W3" /></CarouselItem>
                    <CarouselItem className="p-2"><CourtPair g="G4" w="W4" /></CarouselItem>
                </CarouselContent>
                <CarouselPrevious />
                <CarouselNext />
            </Carousel>
        </div>
    );
}
