
const config = window.IOLA_CONFIG;
const message = document.getElementById("message");
const login = document.getElementById("login");
const dashboard = document.getElementById("dashboard");

let supabaseClient;

function showMessage(text) {
  message.textContent = text;
}

function showLogin() {
  login.classList.remove("hidden");
  dashboard.classList.add("hidden");
}

function showDashboard() {
  login.classList.add("hidden");
  dashboard.classList.remove("hidden");
}

async function checkAdmin(user) {
  if (!user) return false;

  const { data, error } = await supabaseClient
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    showMessage(error.message);
    return false;
  }

  return Boolean(data);
}

async function refreshSession() {
  const { data, error } = await supabaseClient.auth.getUser();

  if (error || !data.user) {
    showLogin();
    return;
  }

  if (await checkAdmin(data.user)) {
    showDashboard();
  } else {
    showMessage("This account is not authorised as an administrator.");
    showLogin();
  }
}

async function initialiseAdmin() {
  if (
    !config?.supabaseUrl ||
    !config?.supabaseAnonKey ||
    !window.supabase
  ) {
    showMessage("Supabase configuration is missing.");
    return;
  }

  supabaseClient = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey
  );

  document.getElementById("loginform")
    .addEventListener("submit", async (event) => {
      event.preventDefault();

      const email = document.getElementById("email").value;
      const password = document.getElementById("password").value;

      showMessage("Signing in...");

      const { error } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) {
        showMessage(error.message);
        return;
      }

      showMessage("");
      await refreshSession();
    });

  document.getElementById("logout")
    .addEventListener("click", async () => {
      await supabaseClient.auth.signOut();
      showMessage("Signed out successfully.");
      showLogin();
    });

  await refreshSession();
}

initialiseAdmin();
