import type { Metadata } from "next";
import { CropWaterForm } from "../../../features/pilot/crop-water-form";

export const metadata: Metadata = { title: "Mi cultivo y mi agua" };

export default function CropWaterPage() {
  return <CropWaterForm />;
}
