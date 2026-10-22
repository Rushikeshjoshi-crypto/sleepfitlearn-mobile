import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { checkStepsAllowed } from "./access";

// false until the check answers (fails closed), and re-checked each time the
// screen is focused — the flag can change while the app is open.
export function useStepsAllowed(): boolean {
  const [allowed, setAllowed] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      checkStepsAllowed().then((a) => {
        if (live) setAllowed(a);
      });
      return () => {
        live = false;
      };
    }, []),
  );
  return allowed;
}
