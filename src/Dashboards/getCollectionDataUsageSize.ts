/**
 * Inspired from:
 * https://github.com/Azure/cosmos-explorer/blob/f968f57543985031ca8b623973c16ebe358a1947/src/Common/dataAccess/getCollectionDataUsageSize.ts
 */

import { Metric, MonitorClient } from "@azure/arm-monitor";

export const getUsageSizeInKB = async (
  monitorARmClient: MonitorClient,
  resourceUri: string,
  databaseName: string,
  containerName?: string
): Promise<number | undefined> => {
  const filter = containerName
    ? `DatabaseName eq '${databaseName}' and CollectionName eq '${containerName}'`
    : `DatabaseName eq '${databaseName}'`;
  const metricnames = "DataUsage,IndexUsage";

  try {
    const metricsResponse = await monitorARmClient.metrics.list(resourceUri, { filter, metricnames });

    if (metricsResponse?.value?.length !== 2) {
      return undefined;
    }

    const dataUsageData = metricsResponse.value[0];
    const indexUsagedata = metricsResponse.value[1];
    const dataUsageSizeInKb: number = getUsageSizeInKb(dataUsageData);
    const indexUsageSizeInKb: number = getUsageSizeInKb(indexUsagedata);

    return dataUsageSizeInKb + indexUsageSizeInKb;
  } catch (e) {
    console.error(e);
    return undefined;
  }
};

const getUsageSizeInKb = (metricsData: Metric): number => {
  const timeSeriesData = metricsData?.timeseries?.[0];
  const usageSizeInBytes = timeSeriesData?.data?.[0]?.total;

  return usageSizeInBytes ? usageSizeInBytes / 1024 : 0;
};
