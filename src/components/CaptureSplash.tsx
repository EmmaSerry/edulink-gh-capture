import { useEffect, useState } from "react";
import "@/styles/capture-intro.css";

const KEY = "edulink-capture-intro-seen";

interface Slide {
  title: string;
  text: string;
  image?: string;
  portrait?: boolean;
}

const SLIDES: Slide[] = [
  { title: "School management for every classroom in Ghana", text: "Registration, daily attendance, marks, report cards and statistics in one system. This app keeps working with no internet." },
  { title: "Take the register in a minute", text: "Everyone starts present. Mark only the exceptions, then save. Totals reach the report card by themselves.", image: "/showcase/attendance.jpg" },
  { title: "Enter marks anywhere, even offline", text: "Work on your phone with no signal. Everything is saved on the phone and sent when you are back online.", image: "/showcase/phones.jpg" },
  { title: "Marks and grades add up automatically", text: "Type the marks. Totals, grades and positions are worked out for you.", image: "/showcase/assessment.jpg" },
  { title: "Report cards parents are proud of", text: "School colours, learner photo, grades, position and remarks. Print or download as PDF.", image: "/showcase/reportcard.jpg", portrait: true },
  { title: "Mock exams and result slips", text: "Enter mock marks, see who is improving, and print a result slip for each candidate.", image: "/showcase/slip.jpg", portrait: true },
];

/** A short animated introduction to the system, shown once each time the app is opened. */
export function CaptureSplash() {
  const [gone, setGone] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  const [i, setI] = useState(0);

  useEffect(() => {
    if (gone) return;
    const t = window.setTimeout(() => {
      if (i >= SLIDES.length - 1) finish();
      else setI(i + 1);
    }, 4200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gone, i]);

  function finish() {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      /* private mode: the intro simply shows again next time */
    }
    setGone(true);
  }

  if (gone) return null;
  const s = SLIDES[i];
  const last = i === SLIDES.length - 1;

  return (
    <div className="cap-intro" role="dialog" aria-label="Welcome to EduLink GH">
      <button type="button" className="cap-intro-skip" onClick={finish}>
        Skip
      </button>
      <div className="cap-intro-slide" key={i}>
        {i === 0 && <img className="cap-intro-logo" src="/edulink-logo.png" alt="EduLink GH" />}
        <div className="cap-intro-title">{s.title}</div>
        {s.image && (
          <div className={`cap-intro-shot ${s.portrait ? "portrait" : ""}`}>
            <img src={s.image} alt={s.title} />
          </div>
        )}
        <div className="cap-intro-text">{s.text}</div>
        {s.image && <div className="cap-intro-note">Illustration with sample data</div>}
      </div>
      <div className="cap-intro-dots">
        {SLIDES.map((x, k) => (
          <i key={x.title} className={k === i ? "on" : ""} />
        ))}
      </div>
      <button type="button" className="cap-intro-next" onClick={() => (last ? finish() : setI(i + 1))}>
        {last ? "Get started" : "Next"}
      </button>
    </div>
  );
}
