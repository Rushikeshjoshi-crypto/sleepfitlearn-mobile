import "react-native-get-random-values";
import {
  CognitoUserPool,
  CognitoUser,
  CognitoUserAttribute,
  AuthenticationDetails,
  CognitoUserSession,
} from "amazon-cognito-identity-js";
import { ENV } from "../../config/env";
import { cognitoStorage } from "./syncStorage";
import { signUpValidationData } from "../auth/preSignUp";

// Mirrors src/lib/aws/cognito.ts in the web app exactly (same user pool, same
// auth flow) — only the token storage backend differs: a sync-cache adapter
// backed by AsyncStorage instead of the browser's localStorage that
// amazon-cognito-identity-js defaults to (see syncStorage.ts for why a plain
// AsyncStorage reference doesn't work here).
const userPool = new CognitoUserPool({
  UserPoolId: ENV.cognitoUserPoolId,
  ClientId: ENV.cognitoClientId,
  Storage: cognitoStorage,
});

export function signIn(email: string, password: string): Promise<CognitoUserSession> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool, Storage: cognitoStorage });
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });
    user.authenticateUser(authDetails, {
      onSuccess: resolve,
      onFailure: reject,
    });
  });
}

export function signUp(
  email: string,
  password: string,
  attributes: { name?: string; phoneNumber?: string; countryCode?: string; birthYear?: number } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const attributeList: CognitoUserAttribute[] = [];
    if (attributes.name) {
      attributeList.push(new CognitoUserAttribute({ Name: "name", Value: attributes.name }));
    }
    if (attributes.phoneNumber) {
      // Stored on a custom attribute rather than the standard `phone_number` —
      // the standard one triggers Cognito's own SMS verification if the pool has
      // it enabled, and there's no OTP-verification UI built for that yet.
      // Mirrors web's src/lib/aws/cognito.ts exactly.
      attributeList.push(
        new CognitoUserAttribute({ Name: "custom:phone_number", Value: attributes.phoneNumber }),
      );
    }
    if (attributes.countryCode) {
      // ISO alpha-2 (e.g. "IN"), captured alongside phone at sign-up — used
      // server-side to resolve regional pricing (see sleepfitlearn-payments).
      attributeList.push(
        new CognitoUserAttribute({ Name: "custom:country_code", Value: attributes.countryCode }),
      );
    }
    // Checked by the backend's Pre Sign-up trigger (sleepfitlearn-presignup)
    // before the account exists; not stored on the Cognito user.
    const validationData = attributes.birthYear == null
      ? []
      : signUpValidationData(attributes.birthYear).map((d) => new CognitoUserAttribute(d));
    userPool.signUp(email, password, attributeList, validationData, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

// The pool is configured with DefaultEmailOption: CONFIRM_WITH_LINK, so
// confirmation happens via a clicked email link, not an in-app code — there
// is no confirmRegistration(code) flow, matching the web app's SignUpForm.
export function resendConfirmationCode(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool, Storage: cognitoStorage });
    user.resendConfirmationCode((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function forgotPassword(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool, Storage: cognitoStorage });
    user.forgotPassword({
      onSuccess: () => resolve(),
      onFailure: reject,
    });
  });
}

export function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool, Storage: cognitoStorage });
    user.confirmPassword(code, newPassword, {
      onSuccess: () => resolve(),
      onFailure: reject,
    });
  });
}

export function signOut(): void {
  userPool.getCurrentUser()?.signOut();
}

// Promise-based session accessor. `CognitoUser.getSession` refreshes stale tokens
// asynchronously, so the caller must await the callback rather than reading a
// variable set inside it after the call returns (that races the refresh and can
// yield a stale/null value even when a valid session exists).
export function getSession(): Promise<CognitoUserSession | null> {
  const user = userPool.getCurrentUser();
  if (!user) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err) return reject(err);
      resolve(session?.isValid() ? session : null);
    });
  });
}

export async function getIdToken(): Promise<string | null> {
  const session = await getSession();
  return session?.getIdToken().getJwtToken() ?? null;
}

export async function getIdTokenClaims(): Promise<Record<string, unknown> | null> {
  const session = await getSession();
  return (session?.getIdToken().payload as Record<string, unknown> | undefined) ?? null;
}

export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession();
  return (session?.getIdToken().payload["sub"] as string | undefined) ?? null;
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getIdToken()) !== null;
}
