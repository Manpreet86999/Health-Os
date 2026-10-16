import * as React from 'react';
import {createReportExperience} from '../../shared/report-experience';
import {useBiologicalData} from '../lib/use-biological-data';
import {invokeCloud} from '../lib/cloud-session';
import {invalidateCloudWorkspace} from '../lib/cloud-api';
export const {WeekGoalsGate,DailyReportGate,DailyReportsPanel,NutritionGoalsPanel}=createReportExperience(React,useBiologicalData,async body=>{const result=await invokeCloud('body-os-email',body);if(body.action==='week-goals'){invalidateCloudWorkspace();window.dispatchEvent(new Event('health-os-sync-request'));}return result;});
