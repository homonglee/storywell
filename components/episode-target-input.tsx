"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import type { Episode } from "@/lib/story-engine";
import { DEFAULT_TARGET_CHARACTERS, MAX_TARGET_CHARACTERS, getEpisodeTargetError } from "@/lib/episode-target";

type Props = {
  episode: Episode;
  disabled: boolean;
  compact?: boolean;
  onChange: (value: number | undefined) => void;
};

export function EpisodeTargetInput({ episode, disabled, compact = false, onChange }: Props) {
  const id = useId();
  const error = getEpisodeTargetError(episode);
  return (
    <label className="episode-target-field" htmlFor={id}>
      <span>목표 글자 수</span>
      <span className="episode-target-entry">
        <Input id={id} type="number" inputMode="numeric" min={1} max={MAX_TARGET_CHARACTERS} step={1}
          value={episode.targetCharacters ?? ""} placeholder={String(DEFAULT_TARGET_CHARACTERS)}
          disabled={disabled} aria-label={episode.number + "화 목표 글자 수"} aria-invalid={Boolean(error)}
          aria-describedby={error ? id + "-error" : compact ? undefined : id + "-hint"}
          onChange={event => onChange(event.target.value === "" ? undefined : Number(event.target.value))} />
        <span>자</span>
      </span>
      {error ? <small id={id + "-error"} className="episode-target-error" role="alert">{error}</small> : null}
      {!compact ? <small id={id + "-hint"}>공백 포함 · 1~20,000자 · 기본 5,000자</small> : null}
    </label>
  );
}
