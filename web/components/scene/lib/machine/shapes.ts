/**
 * Every machine shape the data may ask for (core's scene params), each built in its own file.
 */
import antenna from "./antenna.ts";
import arm from "./arm.ts";
import battery from "./battery.ts";
import chip from "./chip.ts";
import drone from "./drone.ts";
import electrolyser from "./electrolyser.ts";
import engine from "./engine.ts";
import type { Kit, Model } from "./kit.ts";
import membrane from "./membrane.ts";
import motor from "./motor.ts";
import panel from "./panel.ts";
import printer from "./printer.ts";
import sail from "./sail.ts";
import telescope from "./telescope.ts";
import tether from "./tether.ts";
import turbine from "./turbine.ts";
import vehicle from "./vehicle.ts";

export type Shape =
  | "turbine"
  | "chip"
  | "motor"
  | "engine"
  | "panel"
  | "battery"
  | "arm"
  | "printer"
  | "tether"
  | "electrolyser"
  | "membrane"
  | "telescope"
  | "antenna"
  | "drone"
  | "vehicle"
  | "sail";

export const SHAPES: Record<Shape, (kit: Kit) => Model> = {
  turbine,
  chip,
  motor,
  engine,
  panel,
  battery,
  arm,
  printer,
  tether,
  electrolyser,
  membrane,
  telescope,
  antenna,
  drone,
  vehicle,
  sail,
};
