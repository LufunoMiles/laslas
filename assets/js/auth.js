(async () => {
  const $ = id => document.getElementById(id);
  const email = $("authEmail");
  const password = $("authPassword");
  const message = $("authError");
  const submit = $("authSubmit");
  const query = new URLSearchParams(location.search);
  let mode = query.get("mode") || "signup";
  if (!["signin", "signup", "recovery", "reset", "invite"].includes(mode)) mode = "signup";

  function render() {
    const content = {
      signin: ["Welcome back", "Enter your email and password.", "Sign in"],
      signup: ["Create your account", "Enter your email and choose a password.", "Create account"],
      recovery: ["Recover your password", "Enter the email address for your account.", "Send reset link"],
      reset: ["Set a new password", "Choose a new password for your account.", "Save password"],
      invite: ["Accept your invitation", "Choose a password to finish setting up your account.", "Save password"]
    }[mode];
    $("authTitle").textContent = content[0];
    $("authSubtitle").textContent = content[1];
    submit.textContent = content[2];
    const changingPassword = mode === "reset" || mode === "invite";
    $("authTopline").hidden = changingPassword;
    $("authPrompt").textContent = mode === "signup" ? "Already have an account?" : "New to LASLAS 24?";
    $("authModeToggle").textContent = mode === "signup" ? "Sign in" : "Create account";
    $("authEmailField").hidden = changingPassword;
    email.required = !changingPassword;
    $("authPasswordField").hidden = mode === "recovery";
    password.required = mode !== "recovery";
    password.autocomplete = mode === "signin" ? "current-password" : "new-password";
    password.minLength = mode === "signin" ? 1 : 8;
    $("authRecovery").hidden = changingPassword || mode === "recovery";
    $("authBack").hidden = mode !== "recovery";
    message.textContent = "";
  }

  function switchMode(next) {
    mode = next;
    password.value = "";
    render();
  }

  render();
  $("authModeToggle").onclick = () => switchMode(mode === "signup" ? "signin" : "signup");
  $("authRecovery").onclick = () => switchMode("recovery");
  $("authBack").onclick = () => switchMode("signin");
  submit.disabled = true;
  try {
    const sdk = await storeSession.client();
    const { data: { session } } = await sdk.auth.getSession();
    const changingPassword = mode === "reset" || mode === "invite";
    if (session && !changingPassword) return location.replace(storeSession.destination());
    if (!session && changingPassword) {
      message.textContent = "This link is invalid or expired. Request a new password reset link.";
      $("authBack").hidden = false;
      $("authBack").onclick = () => location.replace("auth.html?mode=recovery");
      return;
    }
    submit.disabled = false;
    $("authForm").onsubmit = async event => {
      event.preventDefault();
      submit.disabled = true;
      message.textContent = "";
      const credentials = { email: email.value.trim(), password: password.value };
      const redirect = new URL("auth.html", location.href);
      try {
        let response;
        if (mode === "signin") response = await sdk.auth.signInWithPassword(credentials);
        if (mode === "signup") {
          redirect.searchParams.set("mode", "signin");
          redirect.searchParams.set("next", query.get("next") === "admin" ? "admin" : "store");
          response = await sdk.auth.signUp({ ...credentials, options: { emailRedirectTo: redirect.href } });
        }
        if (mode === "recovery") {
          redirect.searchParams.set("mode", "reset");
          response = await sdk.auth.resetPasswordForEmail(credentials.email, { redirectTo: redirect.href });
        }
        if (mode === "reset" || mode === "invite") response = await sdk.auth.updateUser({ password: password.value });
        if (response.error) throw response.error;
        if (mode === "recovery") message.textContent = "If an account exists, a reset link will be sent.";
        else if (mode === "signup" && !response.data.session) message.textContent = "Check your email to confirm your account.";
        else location.replace(storeSession.destination());
      } catch (error) {
        message.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    };
  } catch (error) {
    message.textContent = error.message;
  }
})();
