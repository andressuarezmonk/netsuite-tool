import { ApiClient, BASE_URL, getHandlerParams } from "./apiClient.service";

export const DeleteEndpoints = {
  Row: `${BASE_URL}?opType=deleteRecords`,
};

export const deleteRow = async (timeIds: string[]): Promise<void> => {
  const { scriptId, deployId } = getHandlerParams();
  await ApiClient.get(DeleteEndpoints.Row, {
    params: {
      script: scriptId,
      deploy: deployId,
      payLoad: JSON.stringify(timeIds),
    },
  });
};

export const DeleteService = { deleteRow };
