"use client";
import { useEffect } from "react";

export function applyDevicePreferences(value: {
  reducedMotion?: boolean;
  largerText?: boolean;
}) {
  document.documentElement.dataset.reducedMotion = String(
    !!value.reducedMotion,
  );
  document.documentElement.dataset.largerText = String(!!value.largerText);
}

export function AccessPreferences() {
  useEffect(() => {
    try {
      const value = localStorage.getItem("steady-access-v1");
      if (value) applyDevicePreferences(JSON.parse(value));
    } catch {
      /* Optional device settings. */
    }
  }, []);
  return null;
}
