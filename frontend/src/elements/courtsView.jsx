import React, { useMemo, useEffect, useState, Fragment } from "react";
import {
    Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious,
} from "../components/ui/carousel.jsx";

function useMediaQuery(q) {
    const [m, setM] = useState(() =>
        typeof window !== "undefined" && window.matchMedia ? window.matchMedia(q).matches : false
    );
    useEffect(() => {
        if (!window.matchMedia) return;
        const mq = window.matchMedia(q);
        const h = e => setM(e.matches);
        mq.addEventListener("change", h);
        return () => mq.removeEventListener("change", h);
    }, [q]);
    return m;
}

export default function CourtsView() {
    const isPhone = useMediaQuery("(max-width: 640px)");

    const courts = useMemo(
        () => [
            { id: "1", name: "Court 1", level: "Advanced" },
            { id: "2", name: "Court 2", level: "Intermediate" },
            { id: "3", name: "Court 3", level: "Advanced" },
            { id: "4", name: "Court 4", level: "Intermediate" },
        ],
        []
    );

    const tilesDesktop = useMemo(
        () =>
            courts.flatMap(c => [
                { key: `c-${c.id}`, title: c.name, level: c.level },            // court
                { key: `w-${c.id}`, title: `Warm-up ${c.id}`, level: "warmup" }, // warm-up
            ]),
        [courts]
    );

    function Card({ title, level }) {
        const isWarmup = level === "warmup";
        const variant = isWarmup ? "warmup" : level === "Advanced" ? "advanced" : "intermediate";

        // inline fallback so borders show even if CSS didn't load
        const style = {
            border: "2px solid var(--border-strong, #bfdbfe)",
            borderRadius: "12px",
            padding: "14px",
            textAlign: "center",
            background: "var(--surface, #fff)",
        };

        return (
            <div className={`court-card is-${variant}`} style={style}>
                <div className="court-card-title" style={{ fontWeight: 700 }}>{title}</div>
                {!isWarmup && <div className={`badge badge-${variant}`}>{level}</div>}
            </div>
        );
    }

    return (
        <section className="card">
            <h3 className="section-title">Courts</h3>

            {isPhone ? (
                <div className="carousel-wrap">
                    <Carousel orientation="vertical">
                        <CarouselContent>
                            {courts.map(c => (
                                <CarouselItem key={c.id}>
                                    <div style={{ display: "grid", gap: 12 }}>
                                        <Card title={c.name} level={c.level} />
                                        <Card title={`Warm-up ${c.id}`} level="warmup" />
                                    </div>
                                </CarouselItem>
                            ))}
                        </CarouselContent>
                        <CarouselPrevious className="btn-nav" />
                        <CarouselNext className="btn-nav" />
                    </Carousel>
                </div>
            ) : (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, minmax(0, 1fr))", // 4 × 2
                        gap: 12,
                        marginTop: 12,
                    }}
                >
                    {tilesDesktop.map(t => (
                        <Card key={t.key} title={t.title} level={t.level} />
                    ))}
                </div>
            )}
        </section>
    );
}
