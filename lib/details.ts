// Labels for the answers an owner gives on the application form, so the
// committee sees them in plain words. Used by the form and the review page.

export const DETAIL_SECTIONS: { key: string; title: string; fields: [string, string][] }[] = [
  { key: "boat", title: "Boat (as submitted)", fields: [
    ["name", "Boat name"], ["sail_number", "Sail number"], ["make", "Builder"], ["model", "Model"], ["year", "Year"],
    ["hull_number", "Hull number"], ["loa_ft", "LOA (ft)"], ["lwl_ft", "LWL (ft)"], ["beam_ft", "Beam (ft)"],
    ["draft_ft", "Draft (ft)"], ["displacement_lb", "Displacement (lb)"], ["home_port", "Home port"],
  ] },
  { key: "rig", title: "Rig and keel", fields: [
    ["rig", "Rig"], ["keel", "Keel"], ["mast_height_ft", "Mast height above water (ft)"],
    ["I", "I (ft)"], ["J", "J (ft)"], ["P", "P (ft)"], ["E", "E (ft)"], ["modifications", "Modifications"],
  ] },
  { key: "sails", title: "Sails", fields: [
    ["largest_headsail_lp", "Largest headsail LP (%)"], ["headsails", "Headsails"], ["roller_furling", "Roller furling"],
    ["spinnaker", "Spinnaker"], ["spinnaker_size", "Largest spinnaker"], ["pole_length_ft", "Pole / sprit length (ft)"],
    ["mainsail", "Mainsail"],
  ] },
  { key: "engine", title: "Engine and propeller", fields: [["engine", "Engine"], ["propeller", "Propeller"]] },
  { key: "payment", title: "Fee", fields: [["method", "Paid by"], ["reference", "Reference"]] },
  { key: "attestation", title: "Owner attestation", fields: [["name", "Signed by"], ["at", "Signed at"]] },
];

export const DETAIL_TEXT: [string, string][] = [
  ["prior_ratings", "Prior ratings from other fleets"],
  ["appeal_grounds", "Grounds for appeal"],
];
