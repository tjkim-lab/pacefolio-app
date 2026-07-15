"use client";

/* 멀티테넌트 테마 — 학원별 --accent 색을 런타임 주입.
   day 1 멀티테넌트 원칙: 색·로고가 학원마다 다름 (여기선 원더짐만) */

import { createContext, useContext } from "react";
import { academy, type Academy } from "./data";

const TenantContext = createContext<Academy>(academy);

export function TenantProvider({
  value = academy,
  children,
}: {
  value?: Academy;
  children: React.ReactNode;
}) {
  return (
    <TenantContext.Provider value={value}>
      <div
        style={
          {
            "--accent": value.themeColor,
            "--accent-ink": value.themeInk,
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </TenantContext.Provider>
  );
}

export const useTenant = () => useContext(TenantContext);
