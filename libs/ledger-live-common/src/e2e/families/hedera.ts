import { pressBoth, pressUntilTextFound } from "../speculos";
import { DeviceLabels } from "../enum/DeviceLabels";

export async function sendHedera() {
  await pressUntilTextFound(DeviceLabels.CONFIRM);
  await pressBoth();
}
