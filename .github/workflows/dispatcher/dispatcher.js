async function dispatchWorkflows({ github, context, comment }) {
    console.log(comment);
}

module.exports = {
  dispatchWorkflows,
};
