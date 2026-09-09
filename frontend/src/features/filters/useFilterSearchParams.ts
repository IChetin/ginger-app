import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

function parseCsv(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function serializeCsv(values: string[]): string | null {
  return values.length > 0 ? values.join(",") : null;
}

export function useCsvSearchParam(key: string): [string[], (next: string[]) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const values = useMemo(() => parseCsv(searchParams.get(key)), [searchParams, key]);

  const setValues = (next: string[]) => {
    const params = new URLSearchParams(searchParams);
    const serialized = serializeCsv(next);
    if (serialized) {
      params.set(key, serialized);
    } else {
      params.delete(key);
    }
    setSearchParams(params, { replace: false });
  };

  return [values, setValues];
}

export function readCsvParam(params: URLSearchParams, key: string): string[] {
  return parseCsv(params.get(key));
}

export function writeCsvParam(params: URLSearchParams, key: string, values: string[]): void {
  const serialized = serializeCsv(values);
  if (serialized) {
    params.set(key, serialized);
  } else {
    params.delete(key);
  }
}

export function writeScalarParam(
  params: URLSearchParams,
  key: string,
  value: string | null | undefined,
): void {
  if (value) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
}
