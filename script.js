let taskLoaded = false;

function generate(content) {
    let task = JSON.parse($("#task-json").text());
    if (!task.notes) {
        alert("Нужно внести номер протокола в описание (description) задачи");
        return;
    }
    const subtasks = JSON.parse($("#subtasks-json").text()).map(x => x.name);
    const nameMatches = /^(\d{2})\.(\d{2})\.(\d{4}) \d{2}:\d{2}\s+(.+)/.exec(task.name);
    if (nameMatches === null) {
        alert("Неверный формат имени задачи");
        throw new Error();
    }

    const zip = new JSZip(content);
    const doc = new Docxtemplater().loadZip(zip);
    doc.setData({
        protocol_number: task.notes,
        topic: nameMatches[4],
        chairman: val("#chairman"),
        secretary: val("#secretary"),
        participants: val("#participants"),
        questions: getQuestions(subtasks),
        answers: getAnswers(subtasks),
        day: nameMatches[1],
        month: nameMatches[2],
        year: nameMatches[3],
        signs: getSigns(val("#chairman"), val("#secretary"), val("#participants"))
    });

    doc.render();

    const out = doc.getZip().generate({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    saveAs(out, `Протокол ${task.notes}.docx`);
}

function val(selector) {
    return $(selector).val();
}

function getAnswers(subtasks) {
    const index = subtasks.indexOf("Решения:");
    if (index === -1) {
        alert("Должна присутствовать строка 'Решения:'");
        throw new Error();
    }
    const answers = [];
    const answerData = subtasks.slice(index + 1);
    for (let i = 0; i < answerData.length; i++) {
        if (/^По.+задаче:$/.exec(answerData[i])) {
            answers.push({
                title: answerData[i],
                subanswers: []
            });
        } else {
            if (answers.length === 0) {
                alert("Первой строкой в блоке Решения должна быть 'По [такой-то] задаче:'");
            }
            answers[answers.length - 1].subanswers.push({
                text: answerData[i]
            });
        }
    }
    return answers;
}

function getQuestions(subtasks) {
    if (subtasks[0] !== "Вопросы:") {
        alert("Первая строка должна быть 'Вопросы:'");
        throw new Error();
    }
    const questions = [];
    for (let i = 1; i < subtasks.length; i++) {
        if (subtasks[i] === "Решения:") {
            return questions;
        } else {
            questions.push({
                text: subtasks[i]
            });
        }
    }
    alert("Должна присутствовать строка 'Решения:'");
    throw new Error();
}

function click() {
    if (!taskLoaded) {
        alert("Нужно загрузить задачу из Asana");
        return;
    }
    let file = $("#file-input").get(0).files[0];
    if (!file) {
        alert("Нужно выбрать файл");
        return;
    }
    const reader = new FileReader();

    reader.onloadend = function () {
        generate(reader.result);
    };
    reader.readAsBinaryString(file);
}

function loadTask() {
    let apikey = "0/cc880fedbaec6446c336f3178bbce1bf"; //$("#apikey").val();
    if(!apikey) {
        alert("Нужно ввести API ключ");
        throw new Error();
    }
    taskLoaded = false;
    let taskMatches = /(\d+)$/.exec($("#task_url").val());
    if (!taskMatches) {
        alert("Нужно указать валидный URL задачи");
        return;
    }
    let loadButton = $("#load_task");
    loadButton.removeClass("btn-primary");
    const client = Asana.Client.create().useAccessToken(apikey);
    client.tasks.findById(taskMatches[1]).then(x => {
        $("#task-json").text(JSON.stringify(x));
        client.tasks.subtasks(taskMatches[1]).then(x => {
            $("#subtasks-json").text(JSON.stringify(x["data"]));
            taskLoaded = true;
            loadButton.addClass("btn-success");
            localStorage.setItem("apikey", apikey);
        }, e => apiError(e.message, loadButton));
    }, e => apiError(e.message, loadButton));
}

function apiError(message, button) {
    alert("Ошибка API Asana: " + message);
    button.addClass("btn-danger");
}

function getSigns(c, s, p) {
    const fioRegex = /(^[\wа-яА-Я]*\s+[\wа-яА-Я]\.[\wа-яА-Я]\.)/u;
    let cMatches = fioRegex.exec(c.trim());
    if (!cMatches) {
        alert("ФИО председателя невалидно, должно быть Фамилия И.О.");
        throw new Error();
    }
    const names = [cMatches[1]];
    let sMatches = fioRegex.exec(s.trim());
    if (!sMatches) {
        alert("ФИО секретаря невалидно, должно быть Фамилия И.О.");
        throw new Error();
    }
    if (names.indexOf(sMatches[1]) === -1) {
        names.push(sMatches[1]);
    }
    if(!p.trim() || p.split(",").length === 0) {
        alert("Заполните имена участников, разделенные запятой");
        throw new Error();
    }
    p.split(",").map(x => x.trim()).forEach(x => {
        if (names.indexOf(x) === -1) {
            names.push(x);
        }
    });
    const maxLength = names.reduce((a, c) => {
        return c.length > a ? c.length : a;
    }, 0);
    return names.map(x => {
        return {
            name: x,
            pad: getPad(maxLength - x.length, "_")
        };
    });
}

function getPad(len, ch) {
    let pad = "";
    for (let i = 0; i < len; i++) {
        pad += ch;
    }
    return pad;
}

$(() => {
    // $("#apikey").val(localStorage.getItem("apikey"));
    $("button#generate").click(click);
    $("button#load_task").click(loadTask);
});