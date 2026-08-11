import { ApiClient, BASE_URL } from "./apiClient.service";

export const DeleteEndpoints = {
  Row: `${BASE_URL}?opType=deleteRecords`,
};

export const deleteRow = async (
  scriptId: string,
  deployId: string,
  timeIds: string[],
): Promise<void> => {
  await ApiClient.get(DeleteEndpoints.Row, {
    params: {
      script: scriptId,
      deploy: deployId,
      payLoad: JSON.stringify(timeIds),
    },
  });
};

export const DeleteService = { deleteRow };
