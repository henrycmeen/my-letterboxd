import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FilmTicket, type TicketData } from "@/components/FilmTicket";
import styles from "@/styles/ticketPrinter.module.css";

const STRIP_COUNT = 10;
const FEED_DURATION_MS = 5_000;
const SLICE_PERCENT = 100 / STRIP_COUNT;

export interface TicketPrinterProps {
  ticket: TicketData;
  onComplete?: () => void;
  skipAnimation?: boolean;
}

type StripStyle = CSSProperties & {
  "--strip-slice-offset": string;
  "--strip-top": string;
};

function hasReducedMotionPreference() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function stripStyle(index: number): StripStyle {
  const sliceOffset = index * SLICE_PERCENT;
  return {
    "--strip-slice-offset": `${sliceOffset * -1}%`,
    "--strip-top": `${sliceOffset}%`,
  };
}

export function TicketPrinter({
  ticket,
  onComplete,
  skipAnimation = false,
}: TicketPrinterProps) {
  const [settled, setSettled] = useState(skipAnimation);
  const completionRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    let cancelled = false;

    function complete() {
      if (cancelled || completionRef.current) return;
      completionRef.current = true;
      setSettled(true);
      onCompleteRef.current?.();
    }

    if (completionRef.current) return;

    if (skipAnimation || hasReducedMotionPreference()) {
      complete();
      return () => {
        cancelled = true;
      };
    }

    const timer = window.setTimeout(complete, FEED_DURATION_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [skipAnimation]);

  const label = `Filmbillett: ${ticket.film.title}, ${ticket.date} klokken ${ticket.time}, ${ticket.venue}`;

  return (
    <div
      className={styles.printer}
      data-settled={settled}
      role="img"
      aria-label={label}
    >
      <div className={styles.slot} aria-hidden="true">
        <span className={styles.slotLine} />
        <span className={styles.statusLight} />
      </div>
      <div className={styles.paperWindow} aria-hidden="true">
        <div className={styles.paper}>
          <div className={styles.paperSegments}>
            {Array.from({ length: STRIP_COUNT }, (_, index) => (
              <div
                className={styles.segment}
                key={index}
                style={stripStyle(index)}
              >
                <div className={styles.segmentArtwork}>
                  <FilmTicket ticket={ticket} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
