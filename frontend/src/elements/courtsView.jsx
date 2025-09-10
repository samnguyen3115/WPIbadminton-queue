import React, { useMemo, useEffect, useState } from "react";

import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
} from "@/components/ui/carousel";


function useMediaQuery(query) {
    const [matches, setMatches] = useState(() => (typeof window !== "undefined" && window.matchMedia) ? window.matchMedia(query).matches : false);
    useEffect(() => {
        if (!window.matchMedia) return;
        const mql = window.matchMedia(query);
        const onChange = (e) => setMatches(e.matches);
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
    }, [query]);
    return matches;
}


export default function CourtsView() {
    const isPhone = useMediaQuery("(max-width: 640px)");
    const sectionStyle = {
        maxWidth: 720,
        margin: "16px auto",
        padding: 24,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        textAlign: "center",
    };
    const titleStyle = { margin: 0, fontSize: 18, fontWeight: 700 };
    const cardStyle = {
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        textAlign: "center",
        height: isPhone ? 160 : "auto", // give vertical Embla a fixed slide height
    };


    const courts = useMemo(
        () => [
            { id: 1, name: "Court 1", status: "Playing", players: ["A", "B", "C", "D"] },
            { id: 2, name: "Court 2", status: "Open", players: [] },
            { id: 3, name: "Court 3", status: "Queued", players: ["E", "F", "G", "H"] },
        ],
        []
    );


    return (
        <div style={sectionStyle}>
            <h3 style={titleStyle}>Courts</h3>
            <div style={{ marginTop: 12 }}>
                <Carousel className="w-full" orientation={isPhone ? "vertical" : "horizontal"}>
                    <CarouselContent>
                        {courts.map((c) => (
                            <CarouselItem key={c.id}>
                                <div style={cardStyle}>
                                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                                    <div style={{ fontSize: 14, opacity: 0.8, marginTop: 4 }}>Status: {c.status}</div>
                                    <div style={{ marginTop: 8 }}>
                                        Players: {c.players.length ? c.players.join(", ") : "None"}
                                    </div>
                                </div>
                            </CarouselItem>
                        ))}
                    </CarouselContent>
                    <CarouselPrevious />
                    <CarouselNext />
                </Carousel>
            </div>
        </div>
    );
}