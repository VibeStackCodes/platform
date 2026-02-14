"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WebPreview, WebPreviewBody } from "@/components/ai-elements/web-preview";
import { Rocket } from "lucide-react";
import { DatabaseManager } from "@/components/supabase-manager/database";

interface BuilderPreviewProps {
  projectId: string;
  sandboxId?: string;
  previewUrl?: string;
  codeServerUrl?: string;
  supabaseUrl?: string;
  supabaseProjectId?: string;
}

export function BuilderPreview({
  projectId,
  sandboxId,
  previewUrl,
  codeServerUrl,
  supabaseUrl,
  supabaseProjectId,
}: BuilderPreviewProps) {
  const [activeTab, setActiveTab] = useState("preview");

  const handleDeploy = async () => {
    try {
      const response = await fetch("/api/projects/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      if (!response.ok) {
        throw new Error("Deployment failed");
      }

      const data = await response.json();
      console.log("Deployed:", data);
    } catch (error) {
      console.error("Deployment error:", error);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header with Deploy button */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="text-sm font-medium">Preview</h2>
        <Button size="sm" onClick={handleDeploy}>
          <Rocket className="mr-2 size-4" />
          Deploy
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
        <div className="border-b px-4">
          <TabsList>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="code">Code</TabsTrigger>
            <TabsTrigger value="database">Database</TabsTrigger>
          </TabsList>
        </div>

        {/* Preview Tab */}
        <TabsContent value="preview" className="h-[calc(100%-4rem)] p-0">
          {previewUrl ? (
            <WebPreview defaultUrl={previewUrl} className="h-full">
              <WebPreviewBody src={previewUrl} className="h-full" />
            </WebPreview>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <div className="text-center">
                {sandboxId ? (
                  <>
                    <div className="mb-3 size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent mx-auto" />
                    <p className="text-sm">Sandbox warming up...</p>
                    <p className="mt-2 text-xs text-muted-foreground/60">Preview will appear once generation starts</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm">Preview will appear here once the project is generated</p>
                    <p className="mt-2 text-xs">Port 3000 from Daytona sandbox</p>
                  </>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Code Tab */}
        <TabsContent value="code" className="h-[calc(100%-4rem)] p-0">
          {codeServerUrl ? (
            <iframe
              src={codeServerUrl}
              className="h-full w-full border-0"
              title="Code Editor"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <div className="text-center">
                {sandboxId ? (
                  <>
                    <div className="mb-3 size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent mx-auto" />
                    <p className="text-sm">Code editor warming up...</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm">Code editor will appear here once the project is generated</p>
                    <p className="mt-2 text-xs">Port 13337 (code-server) from Daytona sandbox</p>
                  </>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Database Tab */}
        <TabsContent value="database" className="h-[calc(100%-4rem)] p-0">
          {supabaseProjectId ? (
            <DatabaseManager projectRef={supabaseProjectId} />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <div className="text-center">
                <p className="text-sm">Database will appear here once the project is generated</p>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
