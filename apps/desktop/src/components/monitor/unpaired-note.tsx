import { Alert, Button } from "@heroui/react";

/** Shown on the monitor after the wizard was skipped on an unpaired machine. */
export function UnpairedNote({ onPair }: { onPair: () => void }) {
  return (
    <Alert status="warning">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>这台机器还没配对</Alert.Title>
        <Alert.Description>
          用量只留在本机，不会出现在 Web 仪表盘。
        </Alert.Description>
      </Alert.Content>
      <Button size="sm" variant="secondary" onPress={onPair}>
        去配对
      </Button>
    </Alert>
  );
}
