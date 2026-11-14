import type { Metadata } from "next";
import { Comparison } from "../../../features/comparison/comparison";

export const metadata: Metadata = { title: "Comparar tres rotaciones" };

export default function ComparePage() {
  return <Comparison />;
}
