"use client";

// Edit dialog for one project's profile (docs/ui-spec.md「项目（`/projects`）」节):
// optional display name, a manual https repo link (else the CLI-detected one,
// unless hidden), and the logo as a typed https URL and/or a cropped upload.
// The text fields save together; the logo upload and its removal apply at
// once, like the settings avatar. The caller remounts it per open (key), so
// the drafts start from the saved profile without an effect.

import type { ProjectsCopy } from "@/lib/copy/projects";
import type { ProjectProfile } from "@/lib/projects/profile";

import { Picture, TrashBin } from "@gravity-ui/icons";
import {
  Button,
  Description,
  FieldError,
  Form,
  Input,
  Label,
  Modal,
  Switch,
  TextField,
  Typography,
  toast,
} from "@heroui/react";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";

import { ProjectLogo } from "./project-logo";

import { PendingButton } from "@/components/pending-button";
import { formatMessage } from "@/lib/copy/message";
import {
  isUnauthorized,
  resetProjectProfile,
  saveProjectProfile,
  uploadProjectLogo,
} from "@/lib/dashboard/api";
import {
  githubOwnerAvatar,
  parseDisplayName,
  parseHttpsUrl,
} from "@/lib/projects/profile";

// react-easy-crop is only needed after a logo file is picked.
const ImageCropDialog = dynamic(
  () =>
    import("@/components/image-crop-dialog").then((mod) => mod.ImageCropDialog),
  { ssr: false, loading: () => null },
);

const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type Busy = "save" | "reset" | "remove" | null;

export function ProjectProfileDialog({
  open,
  projectKey,
  profile,
  uploadEnabled,
  copy,
  locale,
  onClose,
  onProfileChange,
  onUnauthorized,
}: {
  open: boolean;
  projectKey: string;
  profile?: ProjectProfile;
  uploadEnabled: boolean;
  copy: ProjectsCopy;
  locale: "zh" | "en";
  onClose: () => void;
  onProfileChange: (profile: ProjectProfile) => void;
  onUnauthorized: () => void;
}) {
  const text = copy.profile;
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [repoUrl, setRepoUrl] = useState(profile?.manual_repo_url ?? "");
  const [repoHidden, setRepoHidden] = useState(profile?.repo_hidden ?? false);
  const [logoUrl, setLogoUrl] = useState(profile?.logo_url ?? "");
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropLoaded, setCropLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const nameCheck = parseDisplayName(displayName);
  const repoCheck = parseHttpsUrl(repoUrl);
  const logoCheck = parseHttpsUrl(logoUrl);
  const detected = profile?.detected_repo_url ?? null;
  const uploadUrl = profile?.logo_upload_url ?? null;
  const ownerAvatar = githubOwnerAvatar(
    (repoCheck.ok ? repoCheck.value : null) ?? detected,
  );
  const hasManual = Boolean(
    profile &&
    (profile.display_name ||
      profile.manual_repo_url ||
      profile.repo_hidden ||
      profile.logo_url ||
      profile.logo_upload_url),
  );

  function fail(error: unknown): string {
    if (isUnauthorized(error)) {
      onUnauthorized();

      return "unauthorized";
    }
    const message = error instanceof Error ? error.message : String(error);

    toast.danger(formatMessage(text.failed, locale, { error: message }));

    return message;
  }

  async function save() {
    setShowErrors(true);
    if (!nameCheck.ok || !repoCheck.ok || !logoCheck.ok) return;
    setBusy("save");
    try {
      onProfileChange(
        await saveProjectProfile({
          project_key: projectKey,
          display_name: nameCheck.value,
          repo_url: repoCheck.value,
          repo_hidden: repoHidden,
          logo_url: logoCheck.value,
        }),
      );
      toast.success(text.saved);
      onClose();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    if (!confirmReset) {
      setConfirmReset(true);

      return;
    }
    setBusy("reset");
    try {
      onProfileChange(await resetProjectProfile(projectKey));
      toast.success(text.resetDone);
      onClose();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
      setConfirmReset(false);
    }
  }

  // Immediate, like the avatar: the saved fields go back unchanged so pending
  // drafts in the form are neither saved nor lost.
  async function removeUpload() {
    setBusy("remove");
    try {
      onProfileChange(
        await saveProjectProfile({
          project_key: projectKey,
          display_name: profile?.display_name ?? null,
          repo_url: profile?.manual_repo_url ?? null,
          repo_hidden: profile?.repo_hidden ?? false,
          logo_url: profile?.logo_url ?? null,
          clear_logo_upload: true,
        }),
      );
      toast.success(text.logoRemoved);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  }

  async function uploadLogo(file: File): Promise<{ error: string | null }> {
    try {
      onProfileChange(await uploadProjectLogo(projectKey, file));
      toast.success(text.logoUploaded);

      return { error: null };
    } catch (error) {
      return { error: fail(error) };
    }
  }

  function pickImage(file: File) {
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      toast.danger(text.invalidImage);

      return;
    }
    // Revoke the previous objectURL before replacing it.
    if (imageSrc) URL.revokeObjectURL(imageSrc);
    setImageSrc(URL.createObjectURL(file));
    setCropLoaded(true);
    setCropOpen(true);
  }

  function closeCrop() {
    setCropOpen(false);
    if (imageSrc) URL.revokeObjectURL(imageSrc);
    setImageSrc(null);
  }

  return (
    <>
      <Modal.Backdrop
        isDismissable={busy === null}
        isOpen={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <Modal.Container scroll="inside">
          <Modal.Dialog className="sm:max-w-lg">
            <Modal.Header>
              {busy === null ? <Modal.CloseTrigger /> : null}
              <Modal.Heading>{text.title}</Modal.Heading>
              <Typography className="truncate" color="muted" type="body-xs">
                {formatMessage(text.directory, locale, { name: projectKey })}
              </Typography>
            </Modal.Header>
            <Modal.Body>
              <Form
                className="flex flex-col gap-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
              >
                <TextField
                  isInvalid={showErrors && !nameCheck.ok}
                  name="display_name"
                  value={displayName}
                  onChange={setDisplayName}
                >
                  <Label>{text.displayName}</Label>
                  <Input placeholder={projectKey} variant="secondary" />
                  <Description>{text.displayNameHint}</Description>
                  <FieldError>{text.displayNameTooLong}</FieldError>
                </TextField>

                <div className="flex flex-col gap-3">
                  <TextField
                    isInvalid={showErrors && !repoCheck.ok}
                    name="repo_url"
                    value={repoUrl}
                    onChange={setRepoUrl}
                  >
                    <Label>{text.repoUrl}</Label>
                    <Input
                      inputMode="url"
                      placeholder={detected ?? "https://github.com/owner/repo"}
                      variant="secondary"
                    />
                    <Description>{text.repoUrlHint}</Description>
                    <FieldError>{text.invalidHttps}</FieldError>
                  </TextField>
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <Typography
                      className="min-w-0 truncate"
                      color="muted"
                      type="body-xs"
                    >
                      {detected
                        ? formatMessage(text.repoDetected, locale, {
                            url: detected,
                          })
                        : text.repoNotDetected}
                    </Typography>
                    {detected && (repoUrl.trim() || repoHidden) ? (
                      <Button
                        size="sm"
                        variant="tertiary"
                        onPress={() => {
                          setRepoUrl("");
                          setRepoHidden(false);
                        }}
                      >
                        {text.useDetected}
                      </Button>
                    ) : null}
                  </div>
                  <Switch isSelected={repoHidden} onChange={setRepoHidden}>
                    <Switch.Content>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                      <Label>{text.repoHidden}</Label>
                    </Switch.Content>
                    <Description>{text.repoHiddenHint}</Description>
                  </Switch>
                </div>

                <div className="flex flex-col gap-3">
                  <Typography type="body-sm" weight="semibold">
                    {text.logo}
                  </Typography>
                  <div className="flex flex-wrap items-center gap-3">
                    <ProjectLogo
                      name={
                        nameCheck.ok && nameCheck.value
                          ? nameCheck.value
                          : projectKey
                      }
                      profile={{
                        logo_url: logoCheck.ok ? logoCheck.value : null,
                        logo_upload_url: uploadUrl,
                      }}
                      size="lg"
                    />
                    {uploadEnabled ? (
                      <>
                        <input
                          ref={fileInputRef}
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          type="file"
                          onChange={(event) => {
                            const file = event.target.files?.[0];

                            // Clear the value so picking the same file twice re-fires.
                            event.target.value = "";
                            if (file) pickImage(file);
                          }}
                        />
                        <Button
                          isDisabled={busy !== null}
                          size="sm"
                          variant="outline"
                          onPress={() => fileInputRef.current?.click()}
                        >
                          <Picture aria-hidden="true" className="size-4" />
                          {uploadUrl ? text.logoReplace : text.logoUpload}
                        </Button>
                      </>
                    ) : null}
                    {uploadUrl ? (
                      <PendingButton
                        isDisabled={busy !== null && busy !== "remove"}
                        pending={busy === "remove"}
                        size="sm"
                        variant="danger-soft"
                        onPress={() => void removeUpload()}
                      >
                        {busy === "remove" ? null : (
                          <TrashBin aria-hidden="true" className="size-4" />
                        )}
                        {text.logoRemove}
                      </PendingButton>
                    ) : null}
                  </div>
                  {uploadEnabled ? null : (
                    <Typography color="muted" type="body-xs">
                      {text.logoUploadUnavailable}
                    </Typography>
                  )}
                  <TextField
                    isInvalid={showErrors && !logoCheck.ok}
                    name="logo_url"
                    value={logoUrl}
                    onChange={setLogoUrl}
                  >
                    <Label>{text.logoUrl}</Label>
                    <Input
                      inputMode="url"
                      placeholder="https://"
                      variant="secondary"
                    />
                    <Description>{text.logoUrlHint}</Description>
                    <FieldError>{text.invalidHttps}</FieldError>
                  </TextField>
                  {ownerAvatar && logoUrl.trim() !== ownerAvatar ? (
                    <div>
                      <Button
                        size="sm"
                        variant="tertiary"
                        onPress={() => setLogoUrl(ownerAvatar)}
                      >
                        {text.useOwnerAvatar}
                      </Button>
                    </div>
                  ) : null}
                  <Typography color="muted" type="body-xs">
                    {text.logoOrder}
                  </Typography>
                </div>

                {confirmReset ? (
                  <Typography className="text-danger" type="body-xs">
                    {text.resetHint}
                  </Typography>
                ) : null}
              </Form>
            </Modal.Body>
            <Modal.Footer className="w-full flex-wrap">
              {hasManual ? (
                <PendingButton
                  className="me-auto"
                  isDisabled={busy !== null && busy !== "reset"}
                  pending={busy === "reset"}
                  variant="danger-soft"
                  onPress={() => void reset()}
                >
                  {confirmReset ? text.resetConfirm : text.reset}
                </PendingButton>
              ) : null}
              <Button
                isDisabled={busy !== null}
                slot="close"
                variant="secondary"
              >
                {text.cancel}
              </Button>
              <PendingButton
                isDisabled={busy !== null && busy !== "save"}
                pending={busy === "save"}
                onPress={() => void save()}
              >
                {text.save}
              </PendingButton>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {cropLoaded ? (
        <ImageCropDialog
          copy={{ ...text.crop, cancel: text.cancel }}
          fileName="logo"
          imageSrc={imageSrc}
          isOpen={cropOpen}
          upload={uploadLogo}
          onFailed={() => {
            /* the toast is already shown by uploadLogo */
          }}
          onOpenChange={(next) => {
            if (!next) closeCrop();
          }}
          onUploaded={closeCrop}
        />
      ) : null}
    </>
  );
}
