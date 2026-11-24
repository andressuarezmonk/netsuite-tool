import { ApiClient, resolveHandlerRequest } from "./apiClient.service";

const QUERY_DELETE_RECORDS = "opType=deleteRecords";

export const deleteRow = async (timeIds: string[]): Promise<void> => {
  const { url, scriptId, deployId } =
    await resolveHandlerRequest(QUERY_DELETE_RECORDS);
  await ApiClient.get(url, {
    params: {
      script: scriptId,
      deploy: deployId,
      payLoad: JSON.stringify(timeIds),
    },
  });
};

export const DeleteService = { deleteRow };
