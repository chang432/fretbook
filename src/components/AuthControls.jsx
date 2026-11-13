import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/react'

/** Sign in and sign up while signed out; the account menu once signed in. */
export default function AuthControls() {
  return (
    <div className="auth-controls">
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button type="button">Sign in</button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button type="button">Sign up</button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </div>
  )
}
