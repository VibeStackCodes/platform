'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { client } from '@/lib/platform-kit/management-api';

export async function runQuery({
  projectRef,
  query,
  readOnly = true,
}: {
  projectRef: string;
  query: string;
  readOnly?: boolean;
}) {
  const { data, error } = await client.POST('/v1/projects/{ref}/database/query', {
    params: { path: { ref: projectRef } },
    body: { query, read_only: readOnly },
  });

  if (error) {
    throw new Error((error as any)?.message || 'Query failed');
  }

  return data as any;
}

export const useRunQuery = () => {
  return useMutation({
    mutationFn: runQuery,
    onError: (error: Error) => {
      toast.error(error.message || 'There was a problem with your query.');
    },
  });
};
