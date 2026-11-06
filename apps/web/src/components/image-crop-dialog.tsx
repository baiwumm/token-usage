"use client";

// Shared square image crop dialog: react-easy-crop (zoom slider + 90°
// rotation) → canvas composite (256×256 WebP) → the caller's upload function.
// Used by the settings avatar (Supabase-storage upload) and the project logo
// (/api/app/project-profiles). imageSrc arrives as an objectURL owned by the
// parent, which revokes it on close. Interaction model mirrors better-admin's
// avatar-crop-dialog.

import type { Area } from "react-easy-crop";

import { ArrowRotateLeft, ArrowRotateRight } from "@gravity-ui/icons";
import {
  Button,
  Label,
  Modal,
  Slider,
  SliderFill,
  SliderOutput,
  SliderThumb,
  SliderTrack,
  Spinner,
} from "@heroui/react";
import Cropper from "react-easy-crop";
import { useEffect, useState } from "react";

import { getCroppedWebpBlob } from "@/lib/image/crop-image";

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ROTATION_STEP = 90;

export interface ImageCropCopy {
  title: string;
  zoom: string;
  rotateLeft: string;
  rotateRight: string;
  upload: string;
  uploading: string;
  cancel: string;
}

export interface ImageCropDialogProps {
  copy: ImageCropCopy;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  imageSrc: string | null;
  /** Output file name; the extension follows the encoded type. */
  fileName: string;
  onUploaded: () => void;
  upload: (file: File) => Promise<{ error: string | null }>;
  onFailed: () => void;
}

export function ImageCropDialog({
  copy,
  isOpen,
  onOpenChange,
  imageSrc,
  fileName,
  onUploaded,
  upload,
  onFailed,
}: ImageCropDialogProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [uploading, setUploading] = useState(false);
  // Reset key: rebuilds the Cropper subtree when the image changes or the
  // dialog reopens, clearing its internal pan/zoom state.
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
      setResetKey((previous) => previous + 1);
    }
  }, [isOpen, imageSrc]);

  async function submitCrop() {
    if (!imageSrc || !croppedAreaPixels || uploading) return;

    setUploading(true);
    try {
      const blob = await getCroppedWebpBlob(
        imageSrc,
        croppedAreaPixels,
        rotation,
      );
      const type = blob.type || "image/webp";
      const file = new File(
        [blob],
        `${fileName}.${type === "image/png" ? "png" : "webp"}`,
        { type },
      );
      const { error } = await upload(file);

      if (error) {
        onFailed();
      } else {
        onUploaded();
        onOpenChange(false);
      }
    } catch {
      onFailed();
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal.Backdrop
      isDismissable={!uploading}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    >
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-md">
          <Modal.Header>
            {!uploading ? <Modal.CloseTrigger /> : null}
            <Modal.Heading>{copy.title}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            {isOpen && imageSrc ? (
              <div className="flex flex-col gap-4">
                <div className="relative h-72 w-full overflow-hidden rounded-lg">
                  <Cropper
                    key={resetKey}
                    showGrid
                    aspect={1}
                    crop={crop}
                    image={imageSrc}
                    rotation={rotation}
                    zoom={zoom}
                    onCropChange={setCrop}
                    onCropComplete={(_area, areaPixels) =>
                      setCroppedAreaPixels(areaPixels)
                    }
                    onRotationChange={setRotation}
                    onZoomChange={setZoom}
                  />
                </div>
                <Slider
                  aria-label={copy.zoom}
                  maxValue={ZOOM_MAX}
                  minValue={ZOOM_MIN}
                  step={0.1}
                  value={zoom}
                  onChange={(value) =>
                    setZoom(Array.isArray(value) ? (value[0] ?? 1) : value)
                  }
                >
                  <Label>{copy.zoom}</Label>
                  <SliderOutput>{zoom.toFixed(1)}x</SliderOutput>
                  <SliderTrack>
                    <SliderFill />
                    <SliderThumb />
                  </SliderTrack>
                </Slider>
                <div className="flex items-center justify-center gap-2">
                  <Button
                    isDisabled={uploading}
                    size="sm"
                    variant="secondary"
                    onPress={() =>
                      setRotation((previous) => previous - ROTATION_STEP)
                    }
                  >
                    <ArrowRotateLeft aria-hidden="true" className="size-4" />
                    {copy.rotateLeft}
                  </Button>
                  <Button
                    isDisabled={uploading}
                    size="sm"
                    variant="secondary"
                    onPress={() =>
                      setRotation((previous) => previous + ROTATION_STEP)
                    }
                  >
                    <ArrowRotateRight aria-hidden="true" className="size-4" />
                    {copy.rotateRight}
                  </Button>
                </div>
              </div>
            ) : null}
          </Modal.Body>
          <Modal.Footer className="w-full">
            <Button isDisabled={uploading} slot="close" variant="secondary">
              {copy.cancel}
            </Button>
            <Button
              isDisabled={!imageSrc || !croppedAreaPixels}
              isPending={uploading}
              onPress={() => void submitCrop()}
            >
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : null}
                  {isPending ? copy.uploading : copy.upload}
                </>
              )}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
