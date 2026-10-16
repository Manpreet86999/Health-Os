import {z} from 'zod';
import type {ExecutorType} from './run-contracts.js';

export const executorCapabilities=[
 'cloud_reads',
 'cloud_writes',
 'device_active_workout',
 'device_sensors',
 'device_bridge',
 'image_capture'
] as const;

export type ExecutorCapability=typeof executorCapabilities[number];

export interface CapabilityNegotiationResult {
 satisfied:boolean;
 requiredCapability?:ExecutorCapability;
 reason?:string;
 compatibleExecutorTypes?:ExecutorType[];
 continuationInstructions?:string;
}

export const DEFAULT_EXECUTOR_CAPABILITIES:Record<ExecutorType,readonly ExecutorCapability[]>={
 cloud_worker:['cloud_reads','cloud_writes'],
 browser:['cloud_reads','cloud_writes','image_capture'],
 android:['cloud_reads','cloud_writes','device_active_workout','device_sensors','device_bridge','image_capture'],
 device:['cloud_reads','cloud_writes','device_active_workout','device_sensors','device_bridge','image_capture'],
};

export const DEVICE_ONLY_OPERATIONS:Record<string,ExecutorCapability>={
 'training.get_active_workout':'device_active_workout',
 'training.create_adaptation_plan':'device_active_workout',
 'training.start_workout':'device_active_workout',
 'training.log_set':'device_active_workout',
 'training.log_timed_set':'device_active_workout',
 'training.log_reps_set':'device_active_workout',
 'training.apply_adaptation_plan':'device_active_workout',
 'training.apply_today_adaptation':'device_active_workout',
 'training_adaptation':'device_active_workout',
 'training.start_custom_workout':'device_active_workout',
 'workout_draft':'device_active_workout',
 'training.next_exercise':'device_active_workout',
 'training.replace_exercises':'device_active_workout',
 'training.finish_workout':'device_active_workout',
 'camera.capture_photo':'image_capture',
 'camera.take_photo':'image_capture',
 'sensor.stream_live':'device_sensors',
 'sensor.read_local':'device_sensors',
};

/** Determine if a tool or action requires device-specific capabilities not held by this executor. */
export function negotiateCapability(
 operation:string,
 availableCapabilities:readonly ExecutorCapability[]|Set<ExecutorCapability>,
 executorType:ExecutorType='cloud_worker'
):CapabilityNegotiationResult {
 const required=DEVICE_ONLY_OPERATIONS[operation];
 if(!required)return {satisfied:true};

 const hasCap=availableCapabilities instanceof Set?availableCapabilities.has(required):availableCapabilities.includes(required);
 if(hasCap)return {satisfied:true};

 const compatibleExecutors=Object.entries(DEFAULT_EXECUTOR_CAPABILITIES)
  .filter(([,caps])=>caps.includes(required))
  .map(([type])=>type as ExecutorType);

 return {
  satisfied:false,
  requiredCapability:required,
  reason:`Operation '${operation}' requires capability '${required}' which is unavailable on ${executorType}.`,
  compatibleExecutorTypes:compatibleExecutors,
  continuationInstructions:`Open Health OS on a compatible device (${compatibleExecutors.join(', ')}) with '${required}' support to continue this step.`
 };
}
