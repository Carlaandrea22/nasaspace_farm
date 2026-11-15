"use client";

import { useState, type SubmitEvent } from "react";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { cropForParcel, decimal, locationKey, productionPriorities, type CropWater } from "./draft";
import { DraftActions, DraftForm, DraftHeader, Field, type DraftStatus } from "./draft-form";

const crops = ["Maíz forrajero", "Avena forrajera", "Cebada forrajera", "Haba", "Otro"];
const sources = ["Canal o acequia", "Pozo", "Río", "Reservorio", "Otra"];
const turnStatuses = ["Previsto", "Confirmado", "Retrasado", "Aplicado", "Cancelado"];
const harvestUses = ["Forraje", "Venta", "Consumo", "Semilla"];

export function CropWaterForm() {
  return (
    <div className="py-8 sm:py-10">
      <DraftHeader title="Mi cultivo y mi agua" description="Registra la secuencia de cultivos y el próximo turno de riego. Puedes completar lo que falte más adelante." />
      <DraftForm>
        {(draft, save, status, markEdited) => {
          const parcelKey = locationKey(draft?.parcel);
          const data = cropForParcel(draft) ?? (draft?.cropWater?.parcelKey === undefined ? draft?.cropWater : undefined);
          return <CropWaterFields data={data} save={(cropWater) => save({ cropWater: { ...cropWater, parcelKey } })} status={status} markEdited={markEdited} />;
        }}
      </DraftForm>
    </div>
  );
}

function Choice({ name, options, value }: { name: string; options: readonly string[]; value?: string }) {
  return (
    <NativeSelect name={name} defaultValue={value ?? ""}>
      <option value="">Por confirmar</option>
      {options.map((option) => <option key={option}>{option}</option>)}
    </NativeSelect>
  );
}

function CampaignFields({ label, prefix, crop, planting, harvest }: { label: string; prefix: string; crop?: string; planting?: string; harvest?: string }) {
  return (
    <section className="grid gap-3 border-t border-line pt-4" aria-labelledby={`${prefix}-campaign`}>
      <h3 id={`${prefix}-campaign`} className="font-semibold">{label}</h3>
      <Field label={`Cultivo de la ${label.toLowerCase()}`}><Choice name={`${prefix}Crop`} options={crops} value={crop} /></Field>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
        <Field label={`Siembra de la ${label.toLowerCase()}`}><Input name={`${prefix}Planting`} type="date" defaultValue={planting} /></Field>
        <Field label={`Fecha de cosecha de la ${label.toLowerCase()}`}><Input name={`${prefix}Harvest`} type="date" defaultValue={harvest} /></Field>
      </div>
    </section>
  );
}

function CropWaterFields({ data, save, status, markEdited }: { data?: CropWater; save: (data: CropWater) => Promise<void>; status: DraftStatus; markEdited: () => void }) {
  const [error, setError] = useState("");

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    const firstPlanting = value("firstPlanting");
    const firstHarvest = value("firstHarvest");
    const secondPlanting = value("secondPlanting");
    const secondHarvest = value("secondHarvest");
    if ((firstPlanting && firstHarvest && firstHarvest < firstPlanting) || (secondPlanting && secondHarvest && secondHarvest < secondPlanting)) {
      return setError("Revisa las fechas. La cosecha debe ser en la fecha de siembra o después.");
    }
    if (firstHarvest && secondPlanting && secondPlanting < firstHarvest) {
      return setError("La segunda campaña debe iniciar en la fecha de cosecha de la primera o después.");
    }
    const intervalDays = value("intervalDays") ? decimal(value("intervalDays")) : null;
    const volumeM3 = value("volumeM3") ? decimal(value("volumeM3")) : null;
    const flowLs = value("flowLs") ? decimal(value("flowLs")) : null;
    const durationMinutes = value("durationMinutes") ? decimal(value("durationMinutes")) : null;
    const scenarioVolumeM3 = value("scenarioVolumeM3") ? decimal(value("scenarioVolumeM3")) : null;
    if (intervalDays !== null && (!Number.isSafeInteger(intervalDays) || intervalDays <= 0)) return setError("Ingresa la frecuencia de riego como un número entero positivo de días.");
    if (volumeM3 !== null && (!Number.isFinite(volumeM3) || volumeM3 <= 0)) return setError("Ingresa un volumen mayor que cero, en metros cúbicos.");
    if ([flowLs, durationMinutes, scenarioVolumeM3].some((entry) => entry !== null && (!Number.isFinite(entry) || entry <= 0))) return setError("El caudal, la duración y el volumen del supuesto deben ser mayores que cero.");
    setError("");
    void save({
      firstCrop: value("firstCrop"), firstPlanting, firstHarvest,
      secondCrop: value("secondCrop"), secondPlanting, secondHarvest,
      priority: value("priority"), waterSource: value("waterSource"), turnDate: value("turnDate"), intervalDays, volumeM3,
      currentCrop: value("currentCrop"), currentPlanting: value("currentPlanting"), harvestUse: value("harvestUse"),
      turnStatus: value("turnStatus"), flowLs, durationMinutes, scenarioVolumeM3,
    });
  }

  return (
    <form onSubmit={submit} onChange={() => { setError(""); markEdited(); }}>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <fieldset disabled={status === "saving"} className="panel grid gap-5">
          <legend className="px-2 text-lg font-bold">Mis cultivos</legend>
          <p className="text-sm text-muted">Si siembras para forraje, anota como cosecha el día en que planeas cortar el cultivo.</p>
          <CampaignFields label="Primera campaña" prefix="first" crop={data?.firstCrop} planting={data?.firstPlanting} harvest={data?.firstHarvest} />
          <CampaignFields label="Segunda campaña" prefix="second" crop={data?.secondCrop} planting={data?.secondPlanting} harvest={data?.secondHarvest} />
          <Field label="Prioridad de producción"><Choice name="priority" options={productionPriorities} value={data?.priority} /></Field>
          <section className="grid gap-3 border-t border-line pt-4" aria-labelledby="current-crop">
            <h3 id="current-crop" className="font-semibold">Lo que está sembrado ahora</h3>
            <Field label="Cultivo actual"><Choice name="currentCrop" options={crops} value={data?.currentCrop} /></Field>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
              <Field label="Siembra del cultivo actual"><Input name="currentPlanting" type="date" defaultValue={data?.currentPlanting} /></Field>
              <Field label="Uso previsto de la cosecha"><Choice name="harvestUse" options={harvestUses} value={data?.harvestUse} /></Field>
            </div>
          </section>
        </fieldset>
        <fieldset disabled={status === "saving"} className="panel grid gap-4">
            <legend className="px-2 text-lg font-bold">Mi riego</legend>
            <Field label="Fuente de agua"><Choice name="waterSource" options={sources} value={data?.waterSource} /></Field>
            <Field label="Fecha del próximo turno"><Input name="turnDate" type="date" defaultValue={data?.turnDate} /></Field>
            <Field label="Estado del turno"><Choice name="turnStatus" options={turnStatuses} value={data?.turnStatus} /></Field>
            <Field label="Frecuencia del turno (días, opcional)"><Input name="intervalDays" inputMode="numeric" defaultValue={data?.intervalDays ?? ""} /></Field>
            <Field label="Volumen por turno (m³, opcional)"><Input name="volumeM3" inputMode="decimal" defaultValue={data?.volumeM3 ?? ""} /></Field>
            <p className="text-sm text-muted">Si conoces el caudal y la duración, puedes usarlos para estimar el volumen.</p>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
              <Field label="Caudal (L/s)"><Input name="flowLs" inputMode="decimal" defaultValue={data?.flowLs ?? ""} /></Field>
              <Field label="Duración (min)"><Input name="durationMinutes" inputMode="decimal" defaultValue={data?.durationMinutes ?? ""} /></Field>
            </div>
            <Field label="Volumen de escenario (m³, supuesto)"><Input name="scenarioVolumeM3" inputMode="decimal" defaultValue={data?.scenarioVolumeM3 ?? ""} /></Field>
        </fieldset>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-red-800">{error}</p>}
      <DraftActions status={status} next={{ href: "/la-maica/comparar", label: "Ir a la comparación" }} />
    </form>
  );
}
