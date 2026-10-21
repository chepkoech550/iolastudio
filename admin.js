
const config = window.IOLA_CONFIG;
const message = document.getElementById("message");
const login = document.getElementById("login");
const dashboard = document.getElementById("dashboard");

let db;
let editingId = null;

const fields = [
  "name", "description", "category", "tag",
  "price_kes", "product_url", "image_url",
  "sort_order", "published"
];

function notify(text) {
  message.textContent = text;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[c]);
}

function showLogin() {
  login.classList.remove("hidden");
  dashboard.classList.add("hidden");
}

function showDashboard() {
  login.classList.add("hidden");
  dashboard.classList.remove("hidden");
}

function imageSource(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return "/" + path.replace(/^\/+/, "");
}

function buildEditor() {
  dashboard.innerHTML = `
    <h2>Product Management</h2>
    <button id="addProduct">+ ADD PRODUCT</button>
    <div id="productList"></div>

    <section id="productEditor" class="panel hidden">
      <h2 id="editorHeading">Add Product</h2>
      <form id="productForm">
        <label>Name *</label>
        <input name="name" required maxlength="120">

        <label>Description</label>
        <textarea name="description" rows="4"
          style="width:100%;padding:12px"></textarea>

        <label>Category</label>
        <select name="category" style="padding:12px;width:100%">
          <option value="wearables">Wearable art</option>
          <option value="objects">Objects & practice</option>
        </select>

        <label>Tag</label>
        <input name="tag" placeholder="e.g. Wearable art">

        <label>Price (KES)</label>
        <input name="price_kes" type="number" min="0" step="1">

        <label>MyDuka product link</label>
        <input name="product_url" type="url"
          placeholder="https://...">

        <label>Image path or URL</label>
        <input name="image_url"
          placeholder="images/babe-for-jesus.webp">

        <label>Upload new image</label>
        <input id="imageUpload" type="file"
          accept="image/jpeg,image/png,image/webp">

        <label>Display order</label>
        <input name="sort_order" type="number" value="10">

        <label>
          <input name="published" type="checkbox"
            style="width:auto"> Published
        </label>

        <div>
          <button type="submit">SAVE PRODUCT</button>
          <button type="button" id="cancelEdit">CANCEL</button>
        </div>
      </form>
    </section>
  `;

  document.getElementById("addProduct").onclick =
    () => openEditor();

  document.getElementById("cancelEdit").onclick =
    () => document.getElementById("productEditor")
      .classList.add("hidden");

  document.getElementById("productForm").onsubmit =
    saveProduct;
}

async function loadProducts() {
  const { data, error } = await db
    .from("products")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    notify("Cannot load products: " + error.message);
    return;
  }

  const list = document.getElementById("productList");
  list.replaceChildren();

  if (!data.length) {
    list.textContent = "No products yet. Add your first product.";
    return;
  }

  data.forEach(product => {
    const item = document.createElement("div");
    item.className = "panel";

    const name = document.createElement("h3");
    name.textContent = product.name;

    const details = document.createElement("p");
    details.textContent =
      `KES ${product.price_kes ?? "—"} · ` +
      (product.published ? "Published" : "Draft");

    item.append(name, details);

    if (product.image_url) {
      const img = document.createElement("img");
      img.src = imageSource(product.image_url);
      img.alt = product.name;
      img.style.cssText =
        "width:130px;height:130px;object-fit:contain;display:block";
      item.append(img);
    }

    const edit = document.createElement("button");
    edit.textContent = "EDIT";
    edit.onclick = () => openEditor(product);

    const remove = document.createElement("button");
    remove.textContent = "DELETE";
    remove.onclick = () => deleteProduct(product);

    item.append(edit, remove);
    list.append(item);
  });
}

function openEditor(product = null) {
  editingId = product?.id ?? null;
  const form = document.getElementById("productForm");
  form.reset();

  document.getElementById("editorHeading").textContent =
    product ? "Edit Product" : "Add Product";

  if (product) {
    fields.forEach(key => {
      const input = form.elements.namedItem(key);
      if (!input) return;

      if (key === "published") {
        input.checked = Boolean(product[key]);
      } else {
        input.value = product[key] ?? "";
      }
    });
  }

  document.getElementById("productEditor")
    .classList.remove("hidden");

  document.getElementById("productEditor")
    .scrollIntoView({ behavior: "smooth" });
}

async function uploadImage(file) {
  if (!file) return null;

  const allowed = [
    "image/jpeg", "image/png", "image/webp"
  ];

  if (!allowed.includes(file.type) ||
      file.size > 5 * 1024 * 1024) {
    throw new Error("Use a JPG, PNG or WebP under 5 MB.");
  }

  const extension = file.type.split("/")[1]
    .replace("jpeg", "jpg");

  const path = `${crypto.randomUUID()}.${extension}`;

  const { error } = await db.storage
    .from("product-images")
    .upload(path, file, { contentType: file.type });

  if (error) throw error;

  const { data } = db.storage
    .from("product-images")
    .getPublicUrl(path);

  return data.publicUrl;
}

async function saveProduct(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  notify("Saving product...");

  try {
    const record = {};

    fields.forEach(key => {
      const input = form.elements.namedItem(key);
      record[key] = key === "published"
        ? input.checked
        : input.value.trim();
    });

    record.price_kes = record.price_kes === ""
      ? null : Number(record.price_kes);

    record.sort_order = record.sort_order === ""
      ? 10 : Number(record.sort_order);

    record.product_url ||= null;
    record.image_url ||= null;

    const file =
      document.getElementById("imageUpload").files[0];

    if (file) record.image_url = await uploadImage(file);

    let result;

    if (editingId) {
      result = await db.from("products")
        .update(record).eq("id", editingId).select();
    } else {
      result = await db.from("products")
        .insert(record).select();
    }

    if (result.error) throw result.error;

    if (!result.data?.length) {
      throw new Error(
        "No row was saved. Check database permissions."
      );
    }

    notify("Product saved successfully.");
    document.getElementById("productEditor")
      .classList.add("hidden");

    await loadProducts();
  } catch (error) {
    notify("Save failed: " + error.message);
  } finally {
    button.disabled = false;
  }
}

async function deleteProduct(product) {
  if (!confirm(`Delete "${product.name}" permanently?`)) {
    return;
  }

  const { data, error } = await db.from("products")
    .delete().eq("id", product.id).select();

  if (error || !data?.length) {
    notify("Delete failed: " +
      (error?.message || "Check permissions."));
    return;
  }

  notify("Product deleted.");
  await loadProducts();
}

async function checkAdmin(user) {
  if (!user) return false;

  const { data, error } = await db
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    notify(error.message);
    return false;
  }

  return Boolean(data);
}

async function refreshSession() {
  const { data, error } = await db.auth.getUser();

  if (error || !data.user) {
    showLogin();
    return;
  }

  if (!(await checkAdmin(data.user))) {
    notify("This account is not an administrator.");
    showLogin();
    return;
  }

  showDashboard();
  buildEditor();
  await loadProducts();
}

async function initialiseAdmin() {
  if (!config?.supabaseUrl ||
      !config?.supabaseAnonKey ||
      !window.supabase) {
    notify("Supabase configuration is missing.");
    return;
  }

  db = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey
  );

  document.getElementById("loginform").onsubmit =
    async event => {
      event.preventDefault();

      const email =
        document.getElementById("email").value;
      const password =
        document.getElementById("password").value;

      notify("Signing in...");

      const { error } = await db.auth.signInWithPassword({
        email, password
      });

      if (error) {
        notify(error.message);
        return;
      }

      notify("");
      await refreshSession();
    };

  document.getElementById("logout").onclick =
    async () => {
      await db.auth.signOut();
      notify("Signed out.");
      showLogin();
    };

  await refreshSession();
}

initialiseAdmin();
