let skip = 0;

window.onload = generateTodos();

function generateTodos() {
  axios
    .get(`/read-item?skip=${skip}`)
    .then((res) => {
      if (res.data.status !== 200) {
        alert(res.data.message);
        return;
      }
      const todos = res.data.data;

      document.getElementById("item_list").insertAdjacentHTML(
        "beforeend",
        todos
          .map((item) => {
            return `<li class="list-group-item list-group-item-action d-flex align-items-center justify-content-between">
              <div>
                <span class="item-text"> ${item.todo}</span>
                ${
                  item.hasImage
                    ? `<br><a href="${item.imageUrl}" download class="download-btn btn btn-sm btn-success mt-2">Download</a>`
                    : ""
                }
              </div>
              <div>
                <button data-id="${item._id}" class="edit-me btn btn-secondary btn-sm mr-1">Edit</button>
                <button data-id="${item._id}" class="delete-me btn btn-danger btn-sm">Delete</button>
              </div>
            </li>`;
          })
          .join("")
      );
      skip += todos.length;
    })
    .catch((err) => {
      console.log(err);
      alert(err.message);
    });
}

document.addEventListener("click", function (event) {
  // Edit
  if (event.target.classList.contains("edit-me")) {
    const newData = prompt("Enter new Todo Text");
    const id = event.target.getAttribute("data-id");

    axios
      .post("/edit-item", { id, newData })
      .then((res) => {
        if (res.data.status !== 200) {
          alert(res.data.message);
          return;
        }

        event.target.parentElement.parentElement.querySelector(
          ".item-text"
        ).innerHTML = newData;
      })
      .catch((err) => {
        console.log(err);
      });
  }
  // Delete
  else if (event.target.classList.contains("delete-me")) {
    const id = event.target.getAttribute("data-id");

    axios
      .post("/delete-item", { id })
      .then((res) => {
        if (res.data.status !== 200) {
          alert(res.data.message);
          return;
        }
        event.target.parentElement.parentElement.remove();
      })
      .catch((err) => {
        console.log(err);
      });
  }
  // Add
  else if (event.target.classList.contains("add_item")) {
    const todo = document.getElementById("create_field").value;
    const imageFile = document.getElementById("image_input").files[0];

    const formData = new FormData();
    if (todo) formData.append("todo", todo);
    if (imageFile) formData.append("image", imageFile);

    axios
      .post("/create-item", formData, { headers: { "Content-Type": "multipart/form-data" } })
      .then((res) => {
        if (res.data.status === 400) {
          alert(res.data.message);
          return;
        }

        document.getElementById("create_field").value = "";
        document.getElementById("image_input").value = "";

        document.getElementById("item_list").insertAdjacentHTML(
          "beforeend",
          `<li class="list-group-item list-group-item-action d-flex align-items-center justify-content-between">
            <div>
              <span class="item-text"> ${res.data.data.todo}</span>
            </div>
            <div>
              <button data-id="${res.data.data._id}" class="edit-me btn btn-secondary btn-sm mr-1">Edit</button>
              <button data-id="${res.data.data._id}" class="delete-me btn btn-danger btn-sm">Delete</button>
            </div>
          </li>`
        );
      })
      .catch((err) => {
        console.log(err);
        alert(err.response.data);
      });
  }
  // Show more
  else if (event.target.classList.contains("show_more")) {
    generateTodos();
  }
});
