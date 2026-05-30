import { RelayWorkspaceBinding } from "./RelayWorkspaceBinding.js";
import { RelayWorkspaceTemplate } from "./RelayWorkspaceTemplate.js";
import type {
  RelayWorkspaceRecord,
  RelayWorkspaceStatusRecord
} from "./RelayWorkspaceTemplate.js";

interface RelayApiErrorPayload {
  error?: string;
  message?: string;
}

export class RelayWorkspaceProvisioningError extends Error {}

export interface RelayWorkspaceProvisionerOptions {
  binding: RelayWorkspaceBinding;
  fetcher?: typeof fetch;
  template?: RelayWorkspaceTemplate;
}

type RelayJsonResponse<TValue> =
  | { ok: true; value: TValue }
  | { ok: false; error: { message: string; status?: number } };

export class RelayWorkspaceProvisioner {
  private readonly fetcher: typeof fetch;
  private readonly template: RelayWorkspaceTemplate;

  constructor(private readonly options: RelayWorkspaceProvisionerOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.template = options.template ?? new RelayWorkspaceTemplate(options.binding);
  }

  async ensureProvisionedBinding(): Promise<RelayWorkspaceBinding> {
    const existingWorkspace = await this.fetchWorkspace();
    let workspace = existingWorkspace.found
      ? existingWorkspace.workspace
      : await this.createWorkspace();

    if (this.template.needsWorkspaceUpdate(workspace)) {
      workspace = await this.updateWorkspace(this.template.buildWorkspace(workspace));
    }

    const status = await this.fetchWorkspaceStatus();
    const statusError = this.template.validateStatus(status);
    if (statusError) {
      throw new RelayWorkspaceProvisioningError(statusError);
    }

    return this.options.binding;
  }

  private async createWorkspace(): Promise<RelayWorkspaceRecord> {
    const response = await this.requestJson<RelayWorkspaceRecord>("/v1/workspaces", {
      method: "POST",
      body: JSON.stringify(this.template.buildWorkspace()),
      headers: {
        "content-type": "application/json"
      }
    });
    if (!response.ok) {
      throw new RelayWorkspaceProvisioningError(
        `Relay workspace ${this.options.binding.workspaceId} could not be created. ${response.error.message}`
      );
    }

    return response.value;
  }

  private async fetchWorkspace(): Promise<
    | {
        found: false;
      }
    | {
        found: true;
        workspace: RelayWorkspaceRecord;
      }
  > {
    const response = await this.requestJson<RelayWorkspaceRecord>(
      `/v1/workspaces/${this.options.binding.workspaceId}`,
      {
        method: "GET"
      }
    );

    if (!response.ok) {
      if (response.error.status === 404) {
        return { found: false };
      }

      throw new RelayWorkspaceProvisioningError(
        `Relay workspace ${this.options.binding.workspaceId} could not be loaded. ${response.error.message}`
      );
    }

    return {
      found: true,
      workspace: response.value
    };
  }

  private async fetchWorkspaceStatus(): Promise<RelayWorkspaceStatusRecord> {
    const response = await this.requestJson<RelayWorkspaceStatusRecord>(
      `/v1/workspaces/${this.options.binding.workspaceId}/status`,
      {
        method: "GET"
      }
    );
    if (!response.ok) {
      throw new RelayWorkspaceProvisioningError(
        `Relay workspace ${this.options.binding.workspaceId} status could not be verified. ${response.error.message}`
      );
    }

    return response.value;
  }

  private async updateWorkspace(workspace: RelayWorkspaceRecord): Promise<RelayWorkspaceRecord> {
    const response = await this.requestJson<RelayWorkspaceRecord>(
      `/v1/workspaces/${this.options.binding.workspaceId}`,
      {
        method: "PUT",
        body: JSON.stringify(workspace),
        headers: {
          "content-type": "application/json"
        }
      }
    );
    if (!response.ok) {
      throw new RelayWorkspaceProvisioningError(
        `Relay workspace ${this.options.binding.workspaceId} could not be updated. ${response.error.message}`
      );
    }

    return response.value;
  }

  private async requestJson<TValue>(
    path: string,
    init: RequestInit
  ): Promise<RelayJsonResponse<TValue>> {
    const url = new URL(path, this.options.binding.baseUrl).toString();
    let response: Response;

    try {
      response = await this.fetcher(url, init);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown network failure.";

      return {
        ok: false,
        error: {
          message: `Upstream request failed before a response was received. ${message}`
        }
      };
    }

    if (!response.ok) {
      const payload = await readRelayErrorPayload(response);
      const detail = payload.message ?? payload.error ?? `status ${response.status}`;

      return {
        ok: false,
        error: {
          status: response.status,
          message: detail
        }
      };
    }

    return { ok: true, value: (await response.json()) as TValue };
  }
}

async function readRelayErrorPayload(response: Response): Promise<RelayApiErrorPayload> {
  try {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await response.json()) as RelayApiErrorPayload;
    }

    const text = (await response.text()).trim();
    return text ? { message: text } : {};
  } catch {
    return {};
  }
}
