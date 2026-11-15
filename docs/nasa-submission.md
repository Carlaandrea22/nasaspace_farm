# Yaku · Field Shift submission draft

Yaku helps smallholder farmers in Cochabamba choose how to use water and what to plant next. A farmer marks a location, enters the crop and irrigation turn, and sees the next 7 or 14 days of expected rainfall alongside the crop’s estimated water needs. The rotation report compares the farmer’s usual sequence with two alternatives under the same historical weather and soil conditions.

The prototype combines [NASA POWER](https://power.larc.nasa.gov/) weather, [GPM IMERG](https://gpm.nasa.gov/data/imerg) rainfall, and [NASA SMAP](https://www.earthdata.nasa.gov/data/platforms/space-based-platforms/smap) surface and root-zone moisture. [SoilGrids](https://docs.isric.org/globaldata/soilgrids/) informs water retention, [FAO-56](https://www.fao.org/4/x0490e/x0490e00.htm) informs crop water demand, and [Open-Meteo](https://open-meteo.com/) supplies the forecast. The [municipal GAMC catalog](https://recursosgamc.cochabamba.bo/api-doc) supplies district boundaries, peri-urban areas, and mapped drainage. The app uses these layers to support an inspection decision when heavy rain coincides with mapped drainage exposure.

The report shows where data is missing and which estimates use regional observations. Field-scale recommendations still need local crop, soil, and irrigation validation. The current Early IMERG import covers one 0.1° grid cell each for La Maica and Tirani, verified for November 11–13, 2026, in local time. The interface labels modeled rainfall outside the imported coverage. Institutional delivery requires approved receiving channels. Estimated water needs are not measured savings.

## 30-second demo narration

> Yaku helps Cochabamba farmers decide when to irrigate and what to plant next. Mark a field, enter your crop and irrigation turn, and see how upcoming rain could change your water needs. Compare your usual rotation with two alternatives. NASA POWER, IMERG and SMAP provide the climate and moisture evidence. Municipal drainage data helps flag where irrigators should inspect before the next turn.

Before submitting, fill in the team details, public project and demo links, and the resource and license declarations. Credit AI assistance for QA and code changes and the generated carousel illustrations, which carry an on-screen label. Confirm the ownership or license of third-party assets against the [official submission guide](https://www.spaceappschallenge.org/resources/project-submission-guide/).
