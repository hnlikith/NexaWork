/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import axios, { AxiosRequestConfig } from "axios";
import { useCallback } from "react";

export function useApi() {
  const request = useCallback(
    async <T>(config: AxiosRequestConfig): Promise<T> => {
      const res = await axios(config);
      return res.data as T;
    },
    []
  );

  return { request };
}
