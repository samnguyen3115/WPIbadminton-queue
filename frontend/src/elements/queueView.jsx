import React, { useMemo, useEffect, useState } from "react";
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
} from "../components/ui/carousel.jsx"; // relative to elements/


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


function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}


export default function QueueView() {
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
    height: isPhone ? 160 : "auto",
};


const queue = useMemo(
    () => [
        { id: "1", name: "Pakorn" },
        { id: "2", name: "Liam" },
        { id: "3", name: "Noah" },
        { id: "4", name: "Olivia" },
        { id: "5", name: "Emma" },
        { id: "6", name: "Mason" },
        { id: "7", name: "Sophia" },
    ],
    []
);


const pages = useMemo(() => chunk(queue, 4), [queue]);


return (
    <div style={sectionStyle}>
        <h3 style={titleStyle}>Queue</h3>
        <div style={{ marginTop: 12 }}>
            <Carousel className="w-full" orientation={isPhone ? "vertical" : "horizontal"}>
                <CarouselContent>
                    {pages.map((group, idx) => (
                        <CarouselItem key={idx}>
                            <div style={cardStyle}>
                                <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
                                    {group.map((p) => (
                                        <li key={p.id} style={{ padding: "6px 0" }}>
                                            {p.name}
                                        </li>
                                    ))}
                                </ol>
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