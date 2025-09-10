import * as React from "react";
import { Carousel } from "./carousel.jsx";

// Wraps shadcn <Carousel> and flips orientation on phone portrait
export default function ResponsiveCarousel(props) {
    const [portrait, setPortrait] = React.useState(
        typeof window !== "undefined" &&
        window.matchMedia("(orientation: portrait)").matches
    );

    React.useEffect(() => {
        if (typeof window === "undefined") return;
        const mql = window.matchMedia("(orientation: portrait)");
        const onChange = (e) => setPortrait(e.matches);
        // Support older browsers
        if (mql.addEventListener) mql.addEventListener("change", onChange);
        else mql.addListener(onChange);
        return () => {
            if (mql.removeEventListener) mql.removeEventListener("change", onChange);
            else mql.removeListener(onChange);
        };
    }, []);

    return <Carousel orientation={portrait ? "vertical" : "horizontal"} {...props} />;
}
