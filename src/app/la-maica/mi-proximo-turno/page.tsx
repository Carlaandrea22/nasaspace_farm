import type { Metadata } from "next";
import { NextTurn } from "../../../features/operations/next-turn";

export const metadata: Metadata = { title: "Mi próximo turno" };

export default function NextTurnPage() {
  return <NextTurn />;
}
