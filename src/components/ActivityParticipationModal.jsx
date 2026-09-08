// src/components/ActivityParticipationModal.jsx
import React, { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Icons } from "../assets/icons";

const OFFICIAL_ACTIVITIES = [
  "Scientific Seminar / CME",
  "Mental Health Session",
  "Career Counselling Session",
  "Quiz Competition",
  "Clinical Reasoning Challenge",
  "Clinical Case Challenge",
  "Academic Topic Presentation",
  "Academic Poster Presentation",
  "Public Awareness Poster Competition",
];

const OFFICIAL_COMPETITIONS = [
  "Quiz",
  "Clinical Reasoning Challenge",
  "Clinical Case Challenge",
  "Academic Topic Presentation",
  "Academic Poster Presentation",
  "Public Awareness Poster Presentation",
  "Not participating in a competition (Attendee only)",
];

function parseList(val) {
  if (!val) return [];
  let list = [];
  if (Array.isArray(val)) {
    list = val;
  } else if (typeof val === "string") {
    const t = val.trim();
    if (t.startsWith("[") && t.endsWith("]")) {
      try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) list = parsed;
      } catch (_) {}
    }
    if (list.length === 0) {
      list = t.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return list.map((s) => String(s).trim()).filter(Boolean);
}

export function ActivityParticipationModal({ registrations = [], onClose }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const totalAttendees = registrations.length;

  const { activityStats, competitionStats, totalActEntries, totalCompEntries } = useMemo(() => {
    const actMap = {};
    const compMap = {};

    OFFICIAL_ACTIVITIES.forEach((a) => { actMap[a] = 0; });
    OFFICIAL_COMPETITIONS.forEach((c) => { compMap[c] = 0; });

    let actSum = 0;
    let compSum = 0;

    registrations.forEach((r) => {
      const acts = parseList(r.activities).filter((a) => !a.toLowerCase().includes("olympiad"));
      acts.forEach((a) => {
        const match = OFFICIAL_ACTIVITIES.find((o) => o.toLowerCase() === a.toLowerCase());
        const key = match || a;
        actMap[key] = (actMap[key] || 0) + 1;
        actSum++;
      });

      const comps = parseList(r.competition_category).filter((c) => !c.toLowerCase().includes("olympiad"));
      comps.forEach((c) => {
        const match = OFFICIAL_COMPETITIONS.find((o) => o.toLowerCase() === c.toLowerCase());
        const key = match || c;
        compMap[key] = (compMap[key] || 0) + 1;
        if (!key.toLowerCase().includes("attendee only")) {
          compSum++;
        }
      });
    });

    const sortedActivities = Object.entries(actMap)
      .map(([name, count]) => ({
        name,
        count,
        percent: totalAttendees > 0 ? ((count / totalAttendees) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const sortedCompetitions = Object.entries(compMap)
      .map(([name, count]) => ({
        name,
        count,
        isAttendeeOnly: name.toLowerCase().includes("attendee only"),
        percent: totalAttendees > 0 ? ((count / totalAttendees) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => {
        if (a.isAttendeeOnly && !b.isAttendeeOnly) return 1;
        if (!a.isAttendeeOnly && b.isAttendeeOnly) return -1;
        return b.count - a.count;
      });

    return {
      activityStats: sortedActivities,
      competitionStats: sortedCompetitions,
      totalActEntries: actSum,
      totalCompEntries: compSum,
    };
  }, [registrations, totalAttendees]);

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-sky-950 text-white flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300">
              <Icons.Activity className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-black tracking-tight text-white">
                Activity &amp; Participation Summary
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Real-time breakdown of attendee enrollment across sessions and competitions
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
            title="Close modal"
          >
            <Icons.Close className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {/* Centered Total Attendees Banner */}
          <div className="flex flex-col items-center justify-center text-center">
            <div className="inline-flex items-center gap-3 px-6 py-2.5 rounded-2xl bg-gradient-to-r from-sky-50 to-teal-50 border border-sky-200/80 shadow-xs">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-teal-600 text-white flex items-center justify-center shadow-xs">
                <Icons.Users className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block leading-tight">
                  Total Attendees
                </span>
                <span className="text-2xl font-black text-slate-900 leading-none font-mono">
                  {totalAttendees}
                </span>
              </div>
            </div>
          </div>

          {/* Two-Column Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Activities */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  Activities &amp; Sessions
                </h4>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                {activityStats.length} Sessions
              </span>
            </div>

            <div className="space-y-3">
              {activityStats.map((act) => (
                <div
                  key={act.name}
                  className="p-3.5 bg-slate-50/70 hover:bg-slate-50 rounded-2xl border border-slate-200/80 transition-all space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800 leading-snug">
                      {act.name}
                    </span>
                    <div className="text-right flex-shrink-0">
                      <span className="font-mono text-sm font-black text-sky-700 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                        {act.count}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar & Percentage */}
                  <div className="space-y-1">
                    <div className="w-full h-2 rounded-full bg-slate-200/80 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-500 to-teal-500 transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(act.percent, 0))}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                      <span>{act.percent}% of delegates</span>
                      <span>{act.count} / {totalAttendees}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Competitions */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  Competitions &amp; Contests
                </h4>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                {competitionStats.length} Categories
              </span>
            </div>

            <div className="space-y-3">
              {competitionStats.map((comp) => {
                const isAttendeeOnly = comp.isAttendeeOnly;
                return (
                  <div
                    key={comp.name}
                    className={`p-3.5 rounded-2xl border transition-all space-y-2 ${
                      isAttendeeOnly
                        ? "bg-slate-100/60 border-slate-200/80"
                        : "bg-amber-50/30 hover:bg-amber-50/50 border-amber-200/70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-xs font-bold leading-snug ${isAttendeeOnly ? "text-slate-600" : "text-slate-900"}`}>
                          {comp.name}
                        </span>
                        {isAttendeeOnly && (
                          <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-slate-200 text-slate-600">
                            Non-competitive
                          </span>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span
                          className={`font-mono text-sm font-black px-2 py-0.5 rounded-md border shadow-2xs ${
                            isAttendeeOnly
                              ? "text-slate-600 bg-white border-slate-200"
                              : "text-amber-700 bg-white border-amber-200"
                          }`}
                        >
                          {comp.count}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar & Percentage */}
                    <div className="space-y-1">
                      <div className="w-full h-2 rounded-full bg-slate-200/80 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isAttendeeOnly
                              ? "bg-slate-400"
                              : "bg-gradient-to-r from-amber-500 to-rose-500"
                          }`}
                          style={{ width: `${Math.min(100, Math.max(comp.percent, 0))}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                        <span>{comp.percent}% of delegates</span>
                        <span>{comp.count} / {totalAttendees}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0 text-center sm:text-left">
          <span className="text-xs text-slate-500">
            Real-time aggregate data computed directly from all registered delegates.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="btn-primary text-xs py-2 px-6 font-bold shadow-xs w-full sm:w-auto"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(content, document.body) : content;
}
