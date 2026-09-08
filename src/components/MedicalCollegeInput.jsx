// src/components/MedicalCollegeInput.jsx
import React, { useState, useRef, useEffect, useMemo } from "react";
import collegeData from "../data/medicalColleges.json";
import { Icons } from "../assets/icons";

export function MedicalCollegeInput({
  value = "",
  onChange,
  placeholder = "Search or enter your medical college",
  id = "institution",
  required = false,
  className = "",
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Filter colleges based on input
  const query = (value || "").trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!query) {
      return collegeData.all;
    }
    return collegeData.all.filter((name) =>
      name.toLowerCase().includes(query)
    );
  }, [query]);

  // Is current value an exact match from the list?
  const isExactMatch = useMemo(() => {
    return collegeData.all.some(
      (c) => c.toLowerCase() === (value || "").trim().toLowerCase()
    );
  }, [value]);

  // Group filtered results by category
  const groupedResults = useMemo(() => {
    const groups = [];
    const categoryEntries = Object.entries(collegeData.categories);

    for (const [catName, catList] of categoryEntries) {
      const matches = catList.filter((name) =>
        !query || name.toLowerCase().includes(query)
      );
      if (matches.length > 0) {
        groups.push({
          category: catName,
          items: matches,
        });
      }
    }
    return groups;
  }, [query]);

  // Flatten items for keyboard navigation
  const flatItems = useMemo(() => {
    const list = [];
    // If user has typed something that isn't an exact match, item 0 is the custom entry
    if (query && !isExactMatch) {
      list.push({ type: "custom", name: value.trim() });
    }
    groupedResults.forEach((g) => {
      g.items.forEach((item) => {
        list.push({ type: "college", name: item, category: g.category });
      });
    });
    return list;
  }, [query, isExactMatch, value, groupedResults]);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(name) {
    onChange(name);
    setIsOpen(false);
    setHighlightedIndex(-1);
  }

  function handleKeyDown(e) {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < flatItems.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : flatItems.length - 1
      );
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && highlightedIndex < flatItems.length) {
        e.preventDefault();
        handleSelect(flatItems[highlightedIndex].name);
      } else {
        // Just accept whatever was typed
        setIsOpen(false);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  }

  // Auto scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.querySelector(
        `[data-index="${highlightedIndex}"]`
      );
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex]);

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          id={id}
          type="text"
          disabled={disabled}
          className={`form-input pr-16 text-sm py-2.5 ${disabled ? "bg-slate-100/80 text-slate-500 cursor-not-allowed border-slate-200" : ""} ${className}`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            if (disabled) return;
            onChange(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => { if (!disabled) setIsOpen(true); }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          required={required}
        />

        {/* Clear / Toggle icons on right */}
        {!disabled && (
          <div className="absolute right-2.5 flex items-center gap-1">
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  inputRef.current?.focus();
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md transition-colors"
                title="Clear input"
              >
                <Icons.Close className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-md transition-colors"
              title="Toggle suggestions list"
              tabIndex={-1}
            >
              <Icons.ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${
                  isOpen ? "rotate-180 text-sky-600" : ""
                }`}
              />
            </button>
          </div>
        )}
      </div>

      {/* Custom Rich Suggestion Dropdown */}
      {isOpen && (
        <div
          ref={listRef}
          className="absolute z-50 left-0 right-0 mt-1.5 max-h-72 overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-xl py-2 animate-fade-in divide-y divide-slate-100"
          style={{ overscrollBehavior: "contain" }}
        >
          {/* Custom entry notice if typing something new */}
          {query && !isExactMatch && (
            <div className="p-1.5 pb-2">
              <button
                type="button"
                data-index={0}
                onClick={() => handleSelect(value.trim())}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                  highlightedIndex === 0
                    ? "bg-sky-50 text-sky-700"
                    : "hover:bg-slate-50 text-slate-700"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icons.Edit className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />
                  <span>
                    Use custom entry:{" "}
                    <strong className="text-sky-700 font-bold">"{value.trim()}"</strong>
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  Custom
                </span>
              </button>
            </div>
          )}

          {/* Grouped Colleges List */}
          {groupedResults.length > 0 ? (
            groupedResults.map((group) => (
              <div key={group.category} className="py-1.5">
                <div className="px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-50/70">
                  {group.category} ({group.items.length})
                </div>
                <div className="mt-0.5 space-y-0.5 px-1.5">
                  {group.items.map((college) => {
                    // Determine index in flatItems for arrow navigation
                    const itemIndex = flatItems.findIndex(
                      (item) => item.name === college
                    );
                    const isSelected =
                      (value || "").trim().toLowerCase() ===
                      college.toLowerCase();
                    const isHighlighted = highlightedIndex === itemIndex;

                    return (
                      <button
                        key={college}
                        type="button"
                        data-index={itemIndex}
                        onClick={() => handleSelect(college)}
                        className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between ${
                          isHighlighted
                            ? "bg-sky-50 text-sky-900 font-bold"
                            : isSelected
                            ? "bg-sky-50/50 text-sky-800 font-semibold"
                            : "text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Icons.Institution className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span>{college}</span>
                        </div>
                        {isSelected && (
                          <Icons.Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-xs text-slate-400">
              No matching medical colleges found in Bangladesh.
              <p className="text-[11px] text-sky-600 font-semibold mt-1">
                Press Enter or click outside to keep your custom entry: "<strong>{value}</strong>"
              </p>
            </div>
          )}

          <div className="p-2 bg-slate-50 text-[11px] text-slate-400 text-center">
            Tip: Select from 118 verified institutions or type your own custom college name.
          </div>
        </div>
      )}
    </div>
  );
}
