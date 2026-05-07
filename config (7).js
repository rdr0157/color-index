var SitePlanConfig = {
  map: {
    center: [-118.26, 46.14],
    extent: { xmin: -118.64, ymin: 45.82, xmax: -117.88, ymax: 46.47 },
    basemap: "osm"
  },

  layers: {
    parcels: {
      url: "https://services8.arcgis.com/COL6rRPkF9w28VGX/arcgis/rest/services/Parcel_Information_Report/FeatureServer",
      outFields: ["*"],

      popupFields: {
        parcelNumber:   "geo_id",
        ownerName:      "py_owner_n",
        siteAddress:    "full_situs",
        acreage:        "size_acres",
        legalDesc:      "legal_desc",
        fireDistrict:   "FIRE_DIST",
        platBookPage:   "PLAT_BK_PG",
        platLink:       "PLAT_LINK",
        assessorLink:   "link_inter",

        mailAddr1:      "py_addr__1",
        mailCity:       "py_addr_ci",
        mailState:      "py_addr_st",
        mailZip:        "py_addr_zi",
        
        zoningName:     "ZONE_NAME",
        zoningAbbrev:   "ZONE_ABBREV",
        landUseName:    "LU_NAME",
        landUseAbbrev:  "LU_ABBREV",
        uga:            "UGA_NAME",
        shorelineDes:   "SHR_DES",
        shorelineAbbr:  "SHR_ABBREV",
        millCreek:      "MILL_CREEK_WPP",
        mineralLands:   "MINERAL_LANDS",
        seismicClass:   "SEISMIC_CLASS",
        setbackFront:   "SETBACK_FRONT",
        setbackSide:    "SETBACK_SIDE",
        setbackRear:    "SETBACK_REAR",
        setbackNote:    "SETBACK_NOTE",
        caFloodRisk:    "CA_FLOOD_RISK",
        caFloodZone:    "CA_FLOOD_ZONE",
        caCaraHigh:     "CA_CARA_HIGH",
        caCaraMod:      "CA_CARA_MOD",
        caHawkHab:      "CA_HAB_FER_HAWK",
        caSongbird:     "CA_HAB_NEO_SONG",
        caWinterBirds:  "CA_HAB_WIN_PREY",
        caShrubsteppe:  "CA_SHRUB",
        caErosion:      "CA_SLOPE",
        caFaults:       "CA_FAULT",
        caLiquefaction: "CA_LIQUEFACTION",
        caWetland:      "CA_WETLAND",
        caRipName:      "CA_RIP_NAME",
        caRipBuffer:    "CA_RIP_BUFFER"
      }
    }
  },

  branding: {
    countyName:    "Walla Walla County",
    agencyName:    "Community Development",
    toolTitle:     "Site Plan Builder",
    printHeader:   "Walla Walla County — Permit Application Site Plan",
    sealUrl:       "https://jobs.wsac.org/wp-content/uploads/job-manager-uploads/company_logo/2022/03/Walla-Walla-County-Seal-147x150.jpg",
    parcelInfoUrl: "https://experience.arcgis.com/experience/7133ad29736547f2b24bbd0f1753bc24",
    phone:         "509-524-2610",
    address:       "310 W. Poplar Street, Suite 200 · Walla Walla, WA 99362",
    formsUrl:      "https://www.wwcowa.gov/government/community_development/applications.php",
    municodeUrl:   "https://library.municode.com/wa/walla_walla_county/codes/code_of_ordinances?nodeId=TIT18EN_CH18.08CRARPR"
  }
};
