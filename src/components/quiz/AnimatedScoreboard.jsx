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
      rowStyle = "bg-[#64239e] border border-[#9b51e0] text-white font-black shadow-lg";
    } else {
      rowStyle = "bg-white/5 hover:bg-white/10 text-slate-100 font-bold border border-white/5";
    }
  }

  if (isOvertaking && isSwapped) {
    rowStyle += " ring-2 ring-emerald-400/70 shadow-emerald-500/20";
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: `${rowHeight}px`,
        transform: `translateY(${currentSlot * step}px)`,
        transition: isSwapped
          ? "transform 0.65s cubic-bezier(0.34, 1.35, 0.64, 1)"
          : "none",
        zIndex: isOvertaking ? 20 : 1,
      }}
      className={`flex items-center justify-between rounded-2xl border transition-colors ${
        isHost ? "px-6 text-base sm:text-lg" : "px-4 text-sm sm:text-base"
      } ${rowStyle}`}
    >
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <span
          className={`font-black shrink-0 ${
            isHost
              ? "w-8 text-purple-300 text-lg sm:text-xl"
              : "w-5 text-sm font-black text-white/70"
          }`}
        >
          {isHost ? `#${currentRank}` : currentRank}
        </span>
        <span
          className={`font-extrabold tracking-wide truncate ${
            isHost
              ? "max-w-[280px] sm:max-w-[360px]"
              : "max-w-[170px] sm:max-w-[240px]"
          }`}
        >
          {player.name}
        </span>
        {isHost && player.regNumber && (
          <span className="text-xs text-purple-300 font-mono hidden sm:inline">
            [{player.regNumber}]
          </span>
        )}
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
  const topPlayers = players.slice(0, 5);

  const [isSwapped, setIsSwapped] = useState(false);
  const [isCounting, setIsCounting] = useState(false);

  // Compute Initial Order (sorted by prevScore DESC, fallback prevRank ASC)
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

  // Compute Final Order (sorted by current score DESC, fallback rank ASC)
  const finalOrder = [...topPlayers].sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    return (a.rank || 1) - (b.rank || 1);
  });

  // Slot dimensions
  const rowHeight = isHost ? 66 : 56;
  const rowGap = isHost ? 12 : 10;
  const step = rowHeight + rowGap;
  const containerHeight = Math.max(0, topPlayers.length * step - rowGap);

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

  if (topPlayers.length === 0) {
    return (
      <div className="text-center py-6 text-xs sm:text-sm text-purple-300 italic">
        Scores are calculating...
      </div>
    );
  }

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
          ? finalSlot >= 0
            ? finalSlot + 1
            : player.rank || 1
          : initialSlot >= 0
          ? initialSlot + 1
          : player.prevRank || 1;

        const isOvertaking = initialSlot > finalSlot;
        const isMe = currentUserName && player.name === currentUserName;

        return (
          <ScoreboardRow
            key={player.id}
            player={player}
            isHost={isHost}
            isMe={isMe}
            currentSlot={currentSlot}
            currentRank={currentRank}
            step={step}
            rowHeight={rowHeight}
            isSwapped={isSwapped}
            isOvertaking={isOvertaking}
            isCounting={isCounting}
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
      <div className="flex items-center justify-between px-5 py-3.5 rounded-2xl bg-[#592387] border border-[#893ec9] shadow-xl text-white">
        <div className="flex items-center gap-4 min-w-0">
          <span className="font-black text-base text-purple-200 transition-all duration-300">
            {displayRank || 1}
          </span>
          <span className="font-black text-sm sm:text-base truncate max-w-[170px] sm:max-w-[220px]">
            {playerName}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-base font-black text-white">
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
