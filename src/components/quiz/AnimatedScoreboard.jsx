import React, { useState, useEffect } from "react";

/**
 * Hook for smooth number counting animation (e.g. 1,200 -> 2,050)
 */
export function useCountUp(target = 0, start = 0, duration = 900, shouldStart = true) {
  const [value, setValue] = useState(start);

  useEffect(() => {
    if (!shouldStart || target === start) {
      setValue(shouldStart ? target : start);
      return;
    }

    let startTime = null;
    let animationFrameId;

    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      // Ease-out cubic: decelerates into target
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (target - start) * easeOut);
      setValue(current);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        setValue(target);
      }
    };

    animationFrameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrameId);
  }, [target, start, duration, shouldStart]);

  return value;
}

/**
 * Single Animated Scoreboard Row
 */
function ScoreboardRow({
  player,
  isHost,
  isMe,
  currentSlot,
  currentRank,
  step,
  rowHeight,
  isSwapped,
  isOvertaking,
  isCounting,
  opacity = 1,
  scale = 1,
}) {
  const prevScore =
    player.prevScore !== undefined
      ? player.prevScore
      : Math.max(0, (player.score || 0) - (player.pointsAdded || 0));

  const hasGainedPoints =
    (player.pointsAdded !== undefined && player.pointsAdded > 0) ||
    (player.score || 0) > prevScore;

  const displayScore = useCountUp(player.score || 0, prevScore, 900, isCounting);

  // Host vs Participant row styling
  let rowStyle = "";
  if (isHost) {
    if (currentRank === 1) {
      rowStyle =
        "bg-gradient-to-r from-amber-500/25 to-yellow-500/10 border-amber-400/80 text-white shadow-xl";
    } else {
      rowStyle = "bg-white/5 border-white/10 text-slate-100 hover:bg-white/10";
    }
  } else {
    if (isMe) {
      rowStyle =
        "bg-gradient-to-r from-[#7a2cb8] to-[#501784] border-2 border-[#b06cf5] text-white font-black shadow-xl shadow-purple-950/60 scale-[1.01]";
    } else {
      rowStyle = "bg-white/5 hover:bg-white/10 text-slate-100 font-bold border border-white/10";
    }
  }

  const college = player.college || player.institution || "";
  const year = player.year || player.academicYear || "";
  const regNumber = player.regNumber || "";

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: `${rowHeight}px`,
        transform: `translateY(${currentSlot * step}px) scale(${scale})`,
        opacity,
        transition: isSwapped
          ? "transform 0.65s cubic-bezier(0.34, 1.35, 0.64, 1), opacity 0.45s ease, scale 0.45s ease"
          : "none",
        zIndex: isOvertaking ? 20 : isMe ? 15 : 1,
        pointerEvents: opacity === 0 ? "none" : "auto",
      }}
      className={`flex items-center justify-between rounded-2xl border transition-colors ${
        isHost ? "px-5 sm:px-6 text-base sm:text-lg" : "px-3.5 sm:px-5 text-sm sm:text-base"
      } ${rowStyle}`}
    >
      <div className="flex items-center gap-2.5 sm:gap-4 min-w-0 flex-1 mr-2">
        <span
          className={`font-black shrink-0 ${
            isHost
              ? "w-8 text-purple-300 text-lg sm:text-xl"
              : "w-7 sm:w-8 text-sm sm:text-base font-black text-purple-200"
          }`}
        >
          #{currentRank}
        </span>
        <div className="min-w-0 flex-1 py-1">
          <div className="flex flex-wrap items-center gap-x-1.5 sm:gap-x-2 gap-y-0.5">
            <span
              className={`font-black tracking-wide leading-tight ${
                isHost ? "text-base sm:text-lg" : "text-sm sm:text-base text-white"
              } truncate max-w-full sm:max-w-none sm:break-words`}
            >
              {player.name}
            </span>
            {regNumber && (
              <span className="text-[10px] sm:text-xs text-purple-200 font-mono whitespace-nowrap">
                [{regNumber}]
              </span>
            )}
            {isMe && (
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-400 text-slate-950 text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
                YOU
              </span>
            )}
          </div>
          {(college || year) && (
            <div className="text-[10px] sm:text-xs text-purple-200/80 font-medium flex items-center gap-x-1.5 sm:gap-x-2 mt-0.5 leading-snug">
              {college && <span className="truncate max-w-[170px] sm:max-w-xs">{college}</span>}
              {college && year && <span className="text-purple-400 shrink-0">•</span>}
              {year && <span className="text-white font-bold whitespace-nowrap shrink-0">{year}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span
          className={`font-mono font-black ${
            isHost ? "text-emerald-400 text-lg sm:text-xl" : "text-white text-sm sm:text-base"
          }`}
        >
          {displayScore.toLocaleString()}
        </span>
        {/* Up arrow ONLY rendered when points are actively going up */}
        {hasGainedPoints && (
          <span
            className={`text-emerald-400 font-black animate-pulse ${
              isHost ? "text-sm sm:text-base" : "text-xs"
            }`}
          >
            ▲
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Animated Scoreboard List with Overtake Position Swaps and Count-Up
 */
export function AnimatedScoreboardList({
  players = [],
  isHost = false,
  currentUserName = "",
}) {
  const [isSwapped, setIsSwapped] = useState(false);
  const [isCounting, setIsCounting] = useState(false);

  // Slot dimensions - 84px host / 86px participant for comfortable height on phones
  const rowHeight = isHost ? 84 : 86;
  const rowGap = isHost ? 12 : 10;
  const step = rowHeight + rowGap;

  useEffect(() => {
    // Reset on player list update
    setIsSwapped(false);
    setIsCounting(false);

    // Start count-up at t=250ms
    const countTimer = setTimeout(() => {
      setIsCounting(true);
    }, 250);

    // Trigger physical overtake swap at t=750ms
    const swapTimer = setTimeout(() => {
      setIsSwapped(true);
    }, 750);

    return () => {
      clearTimeout(countTimer);
      clearTimeout(swapTimer);
    };
  }, [JSON.stringify(players.map((p) => ({ id: p.id, s: p.score, ps: p.prevScore })))]);

  if (!players || players.length === 0) {
    return (
      <div className="text-center py-6 text-xs sm:text-sm text-purple-300 italic">
        Scores are calculating...
      </div>
    );
  }

  // ── HOST VIEW: Top 10 Auditorium Display ──
  if (isHost) {
    const topPlayers = players.slice(0, 10);
    const initialOrder = [...topPlayers].sort((a, b) => {
      const aPrev =
        a.prevScore !== undefined
          ? a.prevScore
          : Math.max(0, (a.score || 0) - (a.pointsAdded || 0));
      const bPrev =
        b.prevScore !== undefined
          ? b.prevScore
          : Math.max(0, (b.score || 0) - (b.pointsAdded || 0));
      if (bPrev !== aPrev) return bPrev - aPrev;
      return (a.prevRank || 1) - (b.prevRank || 1);
    });

    const finalOrder = [...topPlayers].sort((a, b) => {
      if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
      return (a.rank || 1) - (b.rank || 1);
    });

    const containerHeight = Math.max(0, topPlayers.length * step - rowGap);

    return (
      <div
        className="relative w-full overflow-visible"
        style={{ height: `${containerHeight}px` }}
      >
        {topPlayers.map((player) => {
          const initialSlot = initialOrder.findIndex((x) => x.id === player.id);
          const finalSlot = finalOrder.findIndex((x) => x.id === player.id);

          const currentSlot = isSwapped
            ? finalSlot >= 0
              ? finalSlot
              : initialSlot
            : initialSlot >= 0
            ? initialSlot
            : 0;

          const currentRank = isSwapped
            ? player.rank !== undefined
              ? player.rank
              : finalSlot >= 0
              ? finalSlot + 1
              : 1
            : player.prevRank !== undefined
            ? player.prevRank
            : initialSlot >= 0
            ? initialSlot + 1
            : 1;

          const isOvertaking = initialSlot > finalSlot;

          return (
            <ScoreboardRow
              key={player.id}
              player={player}
              isHost={true}
              isMe={false}
              currentSlot={currentSlot}
              currentRank={currentRank}
              step={step}
              rowHeight={rowHeight}
              isSwapped={isSwapped}
              isOvertaking={isOvertaking}
              isCounting={isCounting}
              opacity={1}
              scale={1}
            />
          );
        })}
      </div>
    );
  }

  // ── PARTICIPANT VIEW: Exactly up to 2 above, ME, and up to 2 below (5 slots total) ──
  const myPlayer =
    players.find(
      (p) =>
        p.isMe ||
        (currentUserName &&
          (p.name || "").trim().toLowerCase() === currentUserName.trim().toLowerCase())
    ) || players[0];

  // Fallback sorting if slots weren't provided by server
  const sortedInitial = [...players].sort((a, b) => {
    const aPrev = a.prevScore !== undefined ? a.prevScore : (a.score || 0) - (a.pointsAdded || 0);
    const bPrev = b.prevScore !== undefined ? b.prevScore : (b.score || 0) - (b.pointsAdded || 0);
    if (bPrev !== aPrev) return bPrev - aPrev;
    return (a.prevRank || 1) - (b.prevRank || 1);
  });
  const myInitialIdx = sortedInitial.findIndex((p) => p.id === myPlayer?.id);
  const initialStart = Math.max(0, myInitialIdx - 2);
  const fallbackInitial5 = sortedInitial.slice(initialStart, initialStart + 5);

  const sortedFinal = [...players].sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    return (a.rank || 1) - (b.rank || 1);
  });
  const myFinalIdx = sortedFinal.findIndex((p) => p.id === myPlayer?.id);
  const finalStart = Math.max(0, myFinalIdx - 2);
  const fallbackFinal5 = sortedFinal.slice(finalStart, finalStart + 5);

  const activeCandidates = players.filter((player) => {
    const iSlot =
      player.initialSlot !== undefined
        ? player.initialSlot
        : fallbackInitial5.findIndex((x) => x.id === player.id);
    const fSlot =
      player.finalSlot !== undefined
        ? player.finalSlot
        : fallbackFinal5.findIndex((x) => x.id === player.id);
    return iSlot >= 0 || fSlot >= 0;
  });

  const slotCount = Math.min(5, Math.max(1, activeCandidates.length));
  const containerHeight = Math.max(0, slotCount * step - rowGap);

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: `${containerHeight}px` }}
    >
      {activeCandidates.map((player) => {
        const iSlot =
          player.initialSlot !== undefined
            ? player.initialSlot
            : fallbackInitial5.findIndex((x) => x.id === player.id);

        const fSlot =
          player.finalSlot !== undefined
            ? player.finalSlot
            : fallbackFinal5.findIndex((x) => x.id === player.id);

        const isMe = Boolean(
          player.isMe ||
            (currentUserName &&
              (player.name || "").trim().toLowerCase() === currentUserName.trim().toLowerCase())
        );
        const myPrevRank = myPlayer?.prevRank || 1;
        const myCurrRank = myPlayer?.rank || 1;

        // Position before swap:
        // In initial5 -> slot iSlot (0..4), opacity 1
        // Outsider newcomer -> slot 5 (below) or -1 (above), opacity 0
        const slotBefore =
          iSlot >= 0 ? iSlot : (player.prevRank || 999) > myPrevRank ? 5 : -1;
        const opacityBefore = iSlot >= 0 ? 1 : 0;
        const scaleBefore = iSlot >= 0 ? 1 : 0.92;

        // Position after swap:
        // In final5 -> slot fSlot (0..4), opacity 1
        // Displaced player -> slot 5 (below) or -1 (above), opacity 0
        const slotAfter =
          fSlot >= 0 ? fSlot : (player.rank || 999) > myCurrRank ? 5 : -1;
        const opacityAfter = fSlot >= 0 ? 1 : 0;
        const scaleAfter = fSlot >= 0 ? 1 : 0.92;

        const currentSlot = isSwapped ? slotAfter : slotBefore;
        const opacity = isSwapped ? opacityAfter : opacityBefore;
        const scale = isSwapped ? scaleAfter : scaleBefore;

        const currentRank = isSwapped
          ? player.rank !== undefined
            ? player.rank
            : fSlot >= 0
            ? fSlot + 1
            : player.prevRank || 1
          : player.prevRank !== undefined
          ? player.prevRank
          : iSlot >= 0
          ? iSlot + 1
          : 1;

        // Overtaking: player improved their slot, or newcomer entered the final 5
        const isOvertaking = fSlot >= 0 && (iSlot === -1 || iSlot > fSlot);

        return (
          <ScoreboardRow
            key={player.id}
            player={player}
            isHost={false}
            isMe={isMe}
            currentSlot={currentSlot}
            currentRank={currentRank}
            step={step}
            rowHeight={rowHeight}
            isSwapped={isSwapped}
            isOvertaking={isOvertaking}
            isCounting={isCounting}
            opacity={opacity}
            scale={scale}
          />
        );
      })}
    </div>
  );
}

/**
 * Pinned Personal Rank Bar for Participant Screen
 */
export function PinnedPersonalBar({
  rank = 1,
  prevRank = 1,
  score = 0,
  prevScore = 0,
  pointsAdded = 0,
  playerName = "",
  regNumber = "",
  college = "",
  year = "",
}) {
  const [isSwapped, setIsSwapped] = useState(false);
  const [isCounting, setIsCounting] = useState(false);

  const hasGainedPoints = pointsAdded > 0 || score > prevScore;
  const displayScore = useCountUp(score, prevScore, 900, isCounting);
  const displayRank = isSwapped ? rank : prevRank;

  useEffect(() => {
    setIsSwapped(false);
    setIsCounting(false);

    const countTimer = setTimeout(() => setIsCounting(true), 250);
    const swapTimer = setTimeout(() => setIsSwapped(true), 750);

    return () => {
      clearTimeout(countTimer);
      clearTimeout(swapTimer);
    };
  }, [score, prevScore, pointsAdded, rank, prevRank]);

  return (
    <div className="pt-4 border-t border-purple-800/50">
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 rounded-2xl bg-[#592387] border border-[#893ec9] shadow-xl text-white">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <span className="font-black text-base sm:text-lg text-purple-200 transition-all duration-300 shrink-0 w-6">
            {displayRank || 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-black text-sm sm:text-base text-white break-words leading-tight">
                {playerName}
              </span>
              {regNumber && (
                <span className="text-[11px] sm:text-xs text-purple-300/90 font-mono whitespace-nowrap">
                  [{regNumber}]
                </span>
              )}
            </div>
            {(college || year) && (
              <div className="text-[11px] sm:text-xs text-purple-200/80 font-medium flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 leading-snug">
                {college && <span className="break-words">{college}</span>}
                {college && year && <span className="text-purple-400">•</span>}
                {year && <span className="text-purple-300 font-bold whitespace-nowrap">{year}</span>}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-base sm:text-lg font-black text-white">
            {displayScore.toLocaleString()}
          </span>
          {/* Up arrow ONLY when point is going up */}
          {hasGainedPoints && (
            <span className="text-emerald-400 text-xs font-black animate-pulse">
              ▲
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
