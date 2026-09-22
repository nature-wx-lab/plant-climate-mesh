# Third-party data notices

## NASA POWER

Climate values are retrieved at runtime from the NASA Langley Research Center POWER Project Climatology and Daily APIs. The site requests temperature, corrected precipitation, all-sky surface shortwave downward irradiance, relative humidity, daily maximum temperature, and daily minimum temperature for January 1991 through December 2020. Daily maximum temperature, daily minimum temperature, daily all-sky surface shortwave downward irradiance, and daily mean relative humidity are averaged by calendar day in the browser.

The global annual and monthly map layers are derived from the public POWER Data v10 monthly Zarr datasets in the NASA POWER AWS Open Data store. Meteorological layers use the MERRA-2 monthly LST source grid. Solar layers combine SRB for 1991–2000 and SYN1deg for 2001–2020, following the source periods used by POWER for the selected 1991–2020 climatology. Source-grid values are aggregated to monthly climatologies and day-weighted annual values, colorized, and reprojected to Web Mercator without smoothing between source cells.

- POWER: <https://power.larc.nasa.gov/>
- Referencing guidance: <https://power.larc.nasa.gov/docs/referencing/>
- NASA Earthdata data use policy: <https://www.earthdata.nasa.gov/engage/open-data-services-software/data-use-policy>
- POWER AWS access: <https://power.larc.nasa.gov/docs/services/aws/>

NASA does not endorse this site. NASA names and identifiers are not used as product branding.

## Natural Earth

The world boundary layer and country names are derived from Natural Earth 1:50m Admin 0 Countries. Capital names are derived from Natural Earth 1:10m Populated Places. Natural Earth data is in the public domain.

- Source: <https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/>
- Capital source: <https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/>
- Terms: <https://www.naturalearthdata.com/about/terms-of-use/>

Country boundaries are shown only as geographic context and do not express a legal position.

## Köppen–Geiger climate classification

The optional climate-classification overlay is derived from the 1991–2020, 0.1-degree map in Beck et al. (2023). The distributed raster is reprojected to Web Mercator with nearest-neighbour sampling and retains the source class colors. The Figshare dataset is distributed under CC0 1.0.

- Dataset: <https://doi.org/10.6084/m9.figshare.c.6395666>
- Article: <https://doi.org/10.1038/s41597-023-02549-6>
- License: <https://creativecommons.org/publicdomain/zero/1.0/>

Citation: Beck, H. E., McVicar, T. R., Vergopolan, N., et al. (2023), “High-resolution (1 km) Köppen-Geiger maps for 1901–2099 based on constrained CMIP6 projections,” *Scientific Data*, 10, 724.
